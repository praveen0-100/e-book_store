import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, tx, getSettings, audit, DATA_DIR } from './db.js';
import { verifyPassword, hashPassword } from './auth.js';
import { paymentsEnabled, keyId, webhookSecret } from './payments.js';
import { emailEnabled, sendMail, layout, esc, publicUrl } from './mailer.js';
import { orderNumber, serializeOrder, getOrder, approvePayment, rejectPayment, approveInvoice, invoicePdf, resendOrderEmail } from './orders.js';
import { rateLimit } from './security.js';

const httpErr = (message, status = 400) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 160;
const csvCell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; }; // also blocks spreadsheet formula injection
const sendCsv = (res, name, header, rows) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send('﻿' + [header.join(',')].concat(rows.map((r) => r.map(csvCell).join(','))).join('\n'));
};

/* ----------------------------------------------------- time helpers (store timezone) */
const tzMin = () => Number(getSettings().tz_offset_minutes) || 0;
export const tzMinutes = tzMin;
/** ISO instant of local midnight, `daysAgo` days back (negative = future). */
export function dayStartISO(daysAgo = 0) {
  const off = tzMin() * 60000;
  const local = Math.floor((Date.now() + off) / 86400000) * 86400000 - daysAgo * 86400000;
  return new Date(local - off).toISOString();
}
/** SQL expressions for "the store-local calendar day / weekday of a UTC ISO-text timestamp column". */
const shifted = (col) => `((${col})::timestamptz AT TIME ZONE 'UTC' + make_interval(mins => ${Math.trunc(tzMin())}))`;
export const localDateOf = (col) => `to_char(${shifted(col)}, 'YYYY-MM-DD')`;
export const localDowOf = (col) => `EXTRACT(DOW FROM ${shifted(col)})::int`;

async function refreshBookRating(bookId) {
  if (!bookId) return;
  const r = (await db.prepare("SELECT COUNT(*) n, AVG(rating) a FROM feedback WHERE book_id = ? AND type='review' AND status='published'").get(bookId));
  (await db.prepare('UPDATE books SET rating = ?, reviews = ? WHERE id = ?').run(r.n ? Math.round(r.a * 10) / 10 : 0, r.n, bookId));
}

/* ============================================================ PUBLIC */
export function mountPublic(app) {
  const limiter = rateLimit({ name: 'feedback', windowMs: 3600 * 1000, max: 8, message: 'You have sent several messages recently. Please try again later.' });

  app.post('/api/feedback', limiter, async (req, res) => {
    const b = req.body || {};
    if (b.website) return res.json({ ok: true }); // honeypot: bots fill hidden fields
    const type = b.type === 'review' ? 'review' : 'message';
    const name = clean(req.user ? req.user.name : b.name, 80), email = clean(req.user ? req.user.email : b.email, 160).toLowerCase(), message = clean(b.message, 3000);
    if (!name) return res.status(400).json({ error: 'Please enter your name.' });
    if (!isEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (message.length < 5) return res.status(400).json({ error: 'Please write a little more.' });
    let bookId = null, rating = null, verified = 0;
    if (type === 'review') {
      const book = (await db.prepare('SELECT id FROM books WHERE id = ? AND published = 1').get(Number(b.book_id)));
      if (!book) return res.status(400).json({ error: 'Book not found.' });
      rating = Math.round(Number(b.rating));
      if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Please choose a star rating.' });
      bookId = book.id;
      verified = (await db.prepare(`SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.book_id = ? AND o.email = ? AND o.status = 'paid' LIMIT 1`).get(bookId, email)) ? 1 : 0;
      if ((await db.prepare("SELECT 1 FROM feedback WHERE type='review' AND book_id = ? AND email = ?").get(bookId, email))) return res.status(409).json({ error: 'You have already reviewed this book. Thank you!' });
    }
    (await db.prepare('INSERT INTO feedback (type,book_id,name,email,rating,subject,message,verified,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(type, bookId, name, email, rating, clean(b.subject, 140), message, verified, type === 'review' ? 'pending' : 'new', new Date().toISOString()));
    res.json({ ok: true, message: type === 'review' ? 'Thank you! Your review will appear once it has been approved.' : 'Thank you! We will get back to you by email.' });
  });

  app.get('/api/books/:slug/reviews', async (req, res) => {
    const book = (await db.prepare('SELECT id FROM books WHERE slug = ? AND published = 1').get(req.params.slug));
    if (!book) return res.status(404).json({ error: 'Book not found' });
    const rows = (await db.prepare("SELECT id, name, rating, message, verified, reply, replied_at, created_at FROM feedback WHERE book_id = ? AND type='review' AND status='published' ORDER BY created_at DESC LIMIT 100").all(book.id));
    const dist = [0, 0, 0, 0, 0, 0];
    for (const r of rows) dist[r.rating]++;
    res.json({ reviews: rows.map((r) => ({ ...r, name: r.name.split(' ')[0] + (r.name.includes(' ') ? ` ${r.name.split(' ').pop()[0]}.` : '') })), distribution: dist.slice(1) });
  });

  app.get('/api/orders/:token/invoice.pdf', wrap(async (req, res) => {
    const o = (await db.prepare('SELECT * FROM orders WHERE token = ?').get(req.params.token));
    if (!o || o.status === 'pending' || o.invoice_status !== 'issued') return res.status(404).send('Invoice not available');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${o.invoice_no}.pdf"`);
    res.send(await invoicePdf(o));
  }));

  app.get('/api/health', async (req, res) => {
    try { (await db.prepare('SELECT 1').get()); res.json({ ok: true, uptime: Math.round(process.uptime()) }); } catch { res.status(503).json({ ok: false }); }
  });
}

/* ============================================================== ADMIN */
export function mountAdmin(admin) {
  const who = (req) => req.admin.email;

  /* ---------------- overview: today vs yesterday, attention list, hourly ---------------- */
  const range = async (from, to) => {
    const o = (await db.prepare(`SELECT COALESCE(SUM(total_cents),0) revenue, COUNT(*) orders, COUNT(DISTINCT email) customers FROM orders WHERE status='paid' AND created_at >= ? AND created_at < ?`).get(from, to));
    const units = (await db.prepare(`SELECT COUNT(*) c FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status='paid' AND o.created_at >= ? AND o.created_at < ?`).get(from, to)).c;
    const refunds = (await db.prepare(`SELECT COALESCE(SUM(total_cents),0) amount, COUNT(*) n FROM orders WHERE status='refunded' AND refunded_at >= ? AND refunded_at < ?`).get(from, to));
    const newCust = (await db.prepare(`SELECT COUNT(*) c FROM (SELECT email, MIN(created_at) f FROM orders WHERE status IN ('paid','refunded') GROUP BY email) t WHERE f >= ? AND f < ?`).get(from, to)).c;
    const reviews = (await db.prepare(`SELECT COUNT(*) c FROM feedback WHERE created_at >= ? AND created_at < ?`).get(from, to)).c;
    return { revenue: o.revenue, orders: o.orders, units, refunds: refunds.amount, refundCount: refunds.n, newCustomers: newCust, feedback: reviews };
  };

  admin.get('/overview', async (req, res) => {
    const t0 = dayStartISO(0), t1 = dayStartISO(-1), y0 = dayStartISO(1);
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0, orders: 0 }));
    const off = tzMin() * 60000;
    for (const r of (await db.prepare(`SELECT created_at, total_cents FROM orders WHERE status='paid' AND created_at >= ? AND created_at < ?`).all(t0, t1))) {
      const h = new Date(new Date(r.created_at).getTime() + off).getUTCHours();
      hours[h].revenue += r.total_cents; hours[h].orders++;
    }
    const c = async (sql) => (await db.prepare(sql).get()).c;
    res.json({
      today: (await range(t0, t1)), yesterday: (await range(y0, t0)), hours,
      attention: {
        paymentApprovals: (await c("SELECT COUNT(*) c FROM orders WHERE status='paid' AND approval_status='pending'")),
        invoiceApprovals: (await c("SELECT COUNT(*) c FROM orders WHERE status='paid' AND approval_status='approved' AND invoice_status='pending'")),
        reviewsToModerate: (await c("SELECT COUNT(*) c FROM feedback WHERE type='review' AND status='pending'")),
        messagesToAnswer: (await c("SELECT COUNT(*) c FROM feedback WHERE type='message' AND status='new'")),
        booksWithoutFile: (await c('SELECT COUNT(*) c FROM books WHERE ebook_file IS NULL')),
        failedEmails: (await c(`SELECT COUNT(*) c FROM email_log WHERE status='failed' AND at >= '${dayStartISO(1)}'`)),
      },
      requireApproval: getSettings().require_approval === 'true', tz: tzMin(),
    });
  });

  /* ---------------- daily report ---------------- */
  const dailyRows = async (days) => {
    const from = dayStartISO(days - 1), to = dayStartISO(-1);
    const paid = new Map((await db.prepare(`SELECT ${localDateOf('created_at')} d, SUM(total_cents) revenue, COUNT(*) orders FROM orders WHERE status='paid' AND created_at >= ? AND created_at < ? GROUP BY 1`).all(from, to)).map((r) => [r.d, r]));
    const units = new Map((await db.prepare(`SELECT ${localDateOf('o.created_at')} d, COUNT(*) c FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status='paid' AND o.created_at >= ? AND o.created_at < ? GROUP BY 1`).all(from, to)).map((r) => [r.d, r.c]));
    const refunds = new Map((await db.prepare(`SELECT ${localDateOf('refunded_at')} d, SUM(total_cents) amount, COUNT(*) n FROM orders WHERE status='refunded' AND refunded_at >= ? AND refunded_at < ? GROUP BY 1`).all(from, to)).map((r) => [r.d, r]));
    const firsts = new Map((await db.prepare(`SELECT ${localDateOf('f')} d, COUNT(*) c FROM (SELECT MIN(created_at) f FROM orders WHERE status IN ('paid','refunded') GROUP BY email) t WHERE f >= ? AND f < ? GROUP BY 1`).all(from, to)).map((r) => [r.d, r.c]));
    const feedback = new Map((await db.prepare(`SELECT ${localDateOf('created_at')} d, COUNT(*) c FROM feedback WHERE created_at >= ? AND created_at < ? GROUP BY 1`).all(from, to)).map((r) => [r.d, r.c]));
    const base = new Date(from).getTime() + tzMin() * 60000;
    return Array.from({ length: days }, (_, i) => {
      const date = new Date(base + i * 86400000).toISOString().slice(0, 10);
      return { date, revenue: paid.get(date)?.revenue || 0, orders: paid.get(date)?.orders || 0, units: units.get(date) || 0, refunds: refunds.get(date)?.amount || 0, refundCount: refunds.get(date)?.n || 0, newCustomers: firsts.get(date) || 0, feedback: feedback.get(date) || 0 };
    }).reverse();
  };
  admin.get('/daily', async (req, res) => res.json((await dailyRows(Math.min(Math.max(Number(req.query.days) || 14, 1), 120)))));
  admin.get('/daily.csv', async (req, res) => {
    const rows = (await dailyRows(Math.min(Math.max(Number(req.query.days) || 30, 1), 365)));
    sendCsv(res, 'daily-report.csv', ['Date', 'Revenue', 'Orders', 'Books sold', 'Refunds', 'Refund count', 'New customers', 'Feedback received'],
      rows.map((r) => [r.date, (r.revenue / 100).toFixed(2), r.orders, r.units, (r.refunds / 100).toFixed(2), r.refundCount, r.newCustomers, r.feedback]));
  });

  /* ---------------- live activity feed ---------------- */
  admin.get('/activity', async (req, res) => {
    const ev = [];
    for (const o of (await db.prepare("SELECT id, name, total_cents, created_at FROM orders WHERE status IN ('paid','refunded') ORDER BY created_at DESC LIMIT 15").all())) ev.push({ at: o.created_at, kind: 'order', text: `${o.name} paid`, amount: o.total_cents, link: `/admin/orders/${o.id}` });
    for (const f of (await db.prepare('SELECT id, type, name, rating, created_at FROM feedback ORDER BY created_at DESC LIMIT 15').all())) ev.push({ at: f.created_at, kind: 'feedback', text: f.type === 'review' ? `${f.name} left a ${f.rating}★ review` : `${f.name} sent a message`, link: '/admin/feedback' });
    for (const a of (await db.prepare("SELECT * FROM audit_log WHERE action != 'payment.captured' ORDER BY at DESC LIMIT 15").all())) ev.push({ at: a.at, kind: 'admin', text: `${a.actor} · ${a.action.replace('.', ' ')} ${a.target}`.trim() });
    ev.sort((a, b) => b.at.localeCompare(a.at));
    res.json(ev.slice(0, 25));
  });

  /* ---------------- approvals (payments + invoices) ---------------- */
  const queueSql = {
    payments: "status='paid' AND approval_status='pending'",
    invoices: "status='paid' AND approval_status='approved' AND invoice_status='pending'",
  };
  admin.get('/approvals', async (req, res) => {
    const tab = queueSql[req.query.tab] ? req.query.tab : 'payments';
    const rows = (await db.prepare(`SELECT o.*, (SELECT COUNT(*) FROM order_items WHERE order_id=o.id) item_count FROM orders o WHERE ${queueSql[tab]} ORDER BY created_at ASC LIMIT 200`).all());
    const counts = Object.fromEntries(await Promise.all(Object.entries(queueSql).map(async ([k, w]) => [k, (await db.prepare(`SELECT COUNT(*) c FROM orders WHERE ${w}`).get()).c])));
    res.json({ tab, counts, requireApproval: getSettings().require_approval === 'true', rows: await Promise.all(rows.map(async (o) => ({ ...(await serializeOrder(o)), item_count: o.item_count }))) });
  });
  admin.post('/orders/:id/approve-payment', async (req, res) => res.json((await serializeOrder((await approvePayment(Number(req.params.id), who(req)))))));
  admin.post('/orders/:id/reject-payment', wrap(async (req, res) => res.json((await serializeOrder(await rejectPayment(Number(req.params.id), who(req), clean(req.body?.reason, 300)))))));
  admin.post('/orders/:id/issue-invoice', async (req, res) => res.json((await serializeOrder((await approveInvoice(Number(req.params.id), who(req)))))));
  admin.post('/orders/:id/resend', wrap(async (req, res) => { await resendOrderEmail(Number(req.params.id), who(req)); res.json({ ok: true, emailEnabled: emailEnabled() }); }));
  admin.post('/approvals/bulk', async (req, res) => {
    const { action, ids = [] } = req.body || {};
    const fn = { 'approve-payment': approvePayment, 'issue-invoice': approveInvoice }[action];
    if (!fn) return res.status(400).json({ error: 'Unknown action' });
    let done = 0; const failed = [];
    for (const id of ids.slice(0, 200)) { try { await fn(Number(id), who(req)); done++; } catch (e) { failed.push({ id, error: e.message }); } }
    res.json({ done, failed });
  });
  admin.get('/orders/:id/invoice.pdf', wrap(async (req, res) => {
    const o = (await getOrder(req.params.id));
    if (!o || o.status === 'pending') return res.status(404).send('Not found');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${o.invoice_no || orderNumber(o.id)}.pdf"`);
    res.send(await invoicePdf(o));
  }));

  /* ---------------- feedback inbox ---------------- */
  admin.get('/feedback', async (req, res) => {
    const { type = '', status = '', q = '', page = 1, limit = 20 } = req.query;
    const where = [], params = [];
    if (type) { where.push('f.type = ?'); params.push(type); }
    if (status === 'unanswered') where.push("f.reply IS NULL AND f.status != 'hidden'");
    else if (status) { where.push('f.status = ?'); params.push(status); }
    if (q) { where.push('(f.name ILIKE ? OR f.email ILIKE ? OR f.message ILIKE ? OR f.subject ILIKE ?)'); params.push(...Array(4).fill(`%${q}%`)); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = (await db.prepare(`SELECT COUNT(*) c FROM feedback f ${w}`).get(...params)).c;
    const lim = Math.min(Number(limit) || 20, 100), off = (Math.max(Number(page), 1) - 1) * lim;
    const rows = (await db.prepare(`SELECT f.*, b.title book_title, b.slug book_slug FROM feedback f LEFT JOIN books b ON b.id = f.book_id ${w} ORDER BY f.created_at DESC LIMIT ? OFFSET ?`).all(...params, lim, off));
    const c = async (sql) => (await db.prepare(sql).get()).c;
    res.json({
      total, pages: Math.ceil(total / lim), page: Number(page), rows: rows.map((r) => ({ ...r })),
      counts: { pending: (await c("SELECT COUNT(*) c FROM feedback WHERE type='review' AND status='pending'")), newMessages: (await c("SELECT COUNT(*) c FROM feedback WHERE type='message' AND status='new'")), unanswered: (await c("SELECT COUNT(*) c FROM feedback WHERE reply IS NULL AND status != 'hidden'")), all: (await c('SELECT COUNT(*) c FROM feedback')) },
    });
  });
  admin.put('/feedback/:id', async (req, res) => {
    const f = (await db.prepare('SELECT * FROM feedback WHERE id = ?').get(Number(req.params.id)));
    if (!f) return res.status(404).json({ error: 'Not found' });
    const allowed = f.type === 'review' ? ['pending', 'published', 'hidden'] : ['new', 'resolved'];
    if (!allowed.includes(req.body?.status)) return res.status(400).json({ error: 'Invalid status' });
    (await db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(req.body.status, f.id));
    (await refreshBookRating(f.book_id));
    (await audit(who(req), `feedback.${req.body.status}`, `#${f.id}`));
    res.json({ ok: true });
  });
  admin.post('/feedback/:id/reply', wrap(async (req, res) => {
    const f = (await db.prepare('SELECT f.*, b.title book_title, b.slug book_slug FROM feedback f LEFT JOIN books b ON b.id = f.book_id WHERE f.id = ?').get(Number(req.params.id)));
    if (!f) return res.status(404).json({ error: 'Not found' });
    const reply = clean(req.body?.reply, 3000);
    if (reply.length < 2) return res.status(400).json({ error: 'Write a reply first.' });
    (await db.prepare("UPDATE feedback SET reply = ?, replied_at = ?, replied_by = ?, status = CASE WHEN type='message' THEN 'resolved' WHEN status='pending' THEN 'published' ELSE status END WHERE id = ?")
      .run(reply, new Date().toISOString(), who(req), f.id));
    (await refreshBookRating(f.book_id));
    (await audit(who(req), 'feedback.replied', `#${f.id}`));
    const s = getSettings();
    const quoted = `<blockquote style="margin:14px 0;padding:10px 14px;border-left:3px solid #d4af6a;background:#faf8f3;color:#555">${esc(f.message).replace(/\n/g, '<br>')}</blockquote>`;
    const sent = await sendMail({
      to: f.email, kind: 'feedback-reply', subject: f.type === 'review' ? `${s.store_name} replied to your review of "${f.book_title}"` : `Re: ${f.subject || 'your message'}`,
      html: layout('We replied to your feedback', `<p>Hi ${esc(f.name.split(' ')[0])},</p>${quoted}<p>${esc(reply).replace(/\n/g, '<br>')}</p><p style="color:#8a8577">— ${esc(s.store_name)} team</p>`,
        f.book_slug ? { label: 'View the book', url: `${publicUrl()}/books/${f.book_slug}` } : undefined),
    });
    res.json({ ok: true, emailed: sent });
  }));
  admin.delete('/feedback/:id', async (req, res) => {
    const f = (await db.prepare('SELECT * FROM feedback WHERE id = ?').get(Number(req.params.id)));
    if (!f) return res.status(404).json({ error: 'Not found' });
    (await db.prepare('DELETE FROM feedback WHERE id = ?').run(f.id));
    (await refreshBookRating(f.book_id));
    (await audit(who(req), 'feedback.deleted', `#${f.id}`));
    res.json({ ok: true });
  });

  /* ---------------- customers (CRM) ---------------- */
  const customersSql = `SELECT email, MAX(name) name, COUNT(*) orders, SUM(CASE WHEN status='paid' THEN total_cents ELSE 0 END) spent,
      SUM(CASE WHEN status='refunded' THEN total_cents ELSE 0 END) refunded, MIN(created_at) first_order, MAX(created_at) last_order
    FROM orders WHERE status != 'pending' GROUP BY email`;
  admin.get('/customers', async (req, res) => {
    const q = clean(req.query.q, 100).toLowerCase();
    const rows = (await db.prepare(`${customersSql} ORDER BY spent DESC LIMIT 1000`).all()).filter((r) => !q || `${r.name} ${r.email}`.toLowerCase().includes(q));
    const fb = new Map((await db.prepare('SELECT email, COUNT(*) c FROM feedback GROUP BY email').all()).map((r) => [r.email, r.c]));
    const notes = new Map((await db.prepare('SELECT email, COUNT(*) c FROM customer_notes GROUP BY email').all()).map((r) => [r.email, r.c]));
    res.json(rows.map((r) => ({ ...r, feedback: fb.get(r.email) || 0, notes: notes.get(r.email) || 0 })));
  });
  admin.get('/customers.csv', async (req, res) => {
    const rows = (await db.prepare(`${customersSql} ORDER BY spent DESC`).all());
    (await audit(who(req), 'customers.exported', '', `${rows.length} rows`));
    sendCsv(res, 'customers.csv', ['Name', 'Email', 'Orders', 'Lifetime spend', 'Refunded', 'First order', 'Last order'],
      rows.map((r) => [r.name, r.email, r.orders, (r.spent / 100).toFixed(2), (r.refunded / 100).toFixed(2), r.first_order, r.last_order]));
  });
  admin.get('/customers/:email', async (req, res) => {
    const email = String(req.params.email).toLowerCase();
    const summary = (await db.prepare(`${customersSql.replace('GROUP BY email', 'AND email = ? GROUP BY email')}`).get(email));
    if (!summary) return res.status(404).json({ error: 'Customer not found' });
    const orderRows = (await db.prepare("SELECT * FROM orders WHERE email = ? AND status != 'pending' ORDER BY created_at DESC").all(email)); const orders = await Promise.all(orderRows.map((o) => serializeOrder(o)));
    const books = (await db.prepare(`SELECT DISTINCT oi.title FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.email = ? AND o.status='paid'`).all(email)).map((r) => r.title);
    res.json({
      ...summary, orderRows: orders, books, aov: summary.orders ? Math.round(summary.spent / Math.max(1, orders.filter((o) => o.status === 'paid').length)) : 0,
      downloads: orders.reduce((a, o) => a + o.items.reduce((x, i) => x + i.downloads, 0), 0),
      notes: (await db.prepare('SELECT * FROM customer_notes WHERE email = ? ORDER BY created_at DESC').all(email)).map((n) => ({ ...n })),
      feedback: (await db.prepare('SELECT f.id, f.type, f.rating, f.message, f.status, f.reply, f.created_at, b.title book_title FROM feedback f LEFT JOIN books b ON b.id=f.book_id WHERE f.email = ? ORDER BY f.created_at DESC').all(email)).map((n) => ({ ...n })),
    });
  });
  admin.post('/customers/:email/notes', async (req, res) => {
    const note = clean(req.body?.note, 1000);
    if (!note) return res.status(400).json({ error: 'Write a note first.' });
    (await db.prepare('INSERT INTO customer_notes (email,note,author,created_at) VALUES (?,?,?,?)').run(String(req.params.email).toLowerCase(), note, who(req), new Date().toISOString()));
    res.json({ ok: true });
  });
  admin.delete('/customers/:email/notes/:id', async (req, res) => {
    (await db.prepare('DELETE FROM customer_notes WHERE id = ? AND email = ?').run(Number(req.params.id), String(req.params.email).toLowerCase()));
    res.json({ ok: true });
  });
  /** Privacy erasure: removes personal data but keeps the (anonymised) financial records required for accounting. */
  admin.post('/customers/:email/erase', async (req, res) => {
    const email = String(req.params.email).toLowerCase();
    if (req.body?.confirm !== email) return res.status(400).json({ error: 'Type the customer’s email to confirm.' });
    const anon = `erased-${crypto.randomBytes(4).toString('hex')}@deleted.invalid`;
    const n = (await tx(async () => {
      const r = (await db.prepare("UPDATE orders SET email = ?, name = 'Erased customer', ip = NULL WHERE email = ?").run(anon, email));
      (await db.prepare("UPDATE feedback SET email = ?, name = 'Erased customer' WHERE email = ?").run(anon, email));
      (await db.prepare('DELETE FROM customer_notes WHERE email = ?').run(email));
      (await db.prepare('DELETE FROM customers WHERE lower(email) = ?').run(email));
      return r.changes;
    }));
    (await audit(who(req), 'customer.erased', email, `${n} orders anonymised`));
    res.json({ ok: true, orders: n });
  });

  /* ---------------- system / audit / email / backup ---------------- */
  admin.get('/system', async (req, res) => {
    const warnings = [];
    const a = (await db.prepare('SELECT password_hash FROM admins WHERE id = ?').get(req.admin.id));
    if (a && verifyPassword('admin123', a.password_hash)) warnings.push('You are still using the default admin password. Change it now (System → Security).');
    if (!process.env.SESSION_SECRET) warnings.push('SESSION_SECRET is not set; admin sessions use an insecure development key.');
    if (!paymentsEnabled()) warnings.push('Razorpay keys are missing, so customers cannot pay yet.');
    else if (!webhookSecret()) warnings.push('RAZORPAY_WEBHOOK_SECRET is not set; orders will not complete if a customer closes the browser mid-payment.');
    if (!emailEnabled()) warnings.push('SMTP is not configured; receipts, invoices and feedback replies are not emailed.');
    if (!process.env.PUBLIC_URL) warnings.push('PUBLIC_URL is not set; links in emails will point to localhost.');
    const dbSize = (await db.prepare('SELECT pg_database_size(current_database()) s').get().catch(() => ({ s: 0 }))).s;
    res.json({
      warnings,
      payments: { enabled: paymentsEnabled(), mode: keyId().startsWith('rzp_live_') ? 'live' : paymentsEnabled() ? 'test' : 'off', webhook: Boolean(webhookSecret()) },
      email: { enabled: emailEnabled(), from: process.env.SMTP_FROM || '', host: process.env.SMTP_HOST || '' },
      publicUrl: publicUrl(), node: process.version, uptime: Math.round(process.uptime()), dbSize, host: os.hostname(),
      counts: { books: (await db.prepare('SELECT COUNT(*) c FROM books').get()).c, orders: (await db.prepare("SELECT COUNT(*) c FROM orders WHERE status != 'pending'").get()).c, feedback: (await db.prepare('SELECT COUNT(*) c FROM feedback').get()).c },
    });
  });
  admin.get('/audit', async (req, res) => {
    const page = Math.max(Number(req.query.page) || 1, 1), lim = 30;
    const total = (await db.prepare('SELECT COUNT(*) c FROM audit_log').get()).c;
    res.json({ total, pages: Math.ceil(total / lim), page, rows: (await db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?').all(lim, (page - 1) * lim)).map((r) => ({ ...r })) });
  });
  admin.get('/email-log', async (req, res) => res.json((await db.prepare('SELECT * FROM email_log ORDER BY id DESC LIMIT 100').all()).map((r) => ({ ...r }))));
  admin.post('/email-test', wrap(async (req, res) => {
    const to = clean(req.body?.to, 160) || req.admin.email;
    if (!isEmail(to)) return res.status(400).json({ error: 'Enter a valid email.' });
    if (!emailEnabled()) return res.status(400).json({ error: 'SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM in .env.' });
    const ok = await sendMail({ to, kind: 'test', subject: 'Test email', html: layout('Email is working', '<p>Your store can send email. 🎉</p>') });
    if (!ok) return res.status(502).json({ error: 'Sending failed. See the email log for the error.' });
    res.json({ ok: true });
  }));
  /** Full data export as JSON (all tables, uploaded file names only). Use your database provider's backups for point-in-time recovery. */
  admin.get('/backup', async (req, res) => {
    const dump = { exported_at: new Date().toISOString(), tables: {} };
    for (const t of ['books', 'orders', 'order_items', 'coupons', 'settings', 'feedback', 'customers', 'customer_notes', 'audit_log', 'email_log']) dump.tables[t] = await db.prepare(t === 'customers' ? 'SELECT id, email, name, google_sub, email_verified, created_at, last_login FROM customers' : `SELECT * FROM ${t}`).all(); // never export password hashes
    await audit(who(req), 'backup.downloaded');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="preppath-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.send(JSON.stringify(dump));
  });
  admin.post('/password', async (req, res) => {
    const { current = '', next = '' } = req.body || {};
    const a = (await db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id));
    if (!a || !verifyPassword(String(current), a.password_hash)) return res.status(400).json({ error: 'Your current password is incorrect.' });
    if (String(next).length < 10) return res.status(400).json({ error: 'Use at least 10 characters for the new password.' });
    if (next === current) return res.status(400).json({ error: 'Choose a different password.' });
    (await db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(String(next)), a.id));
    (await audit(who(req), 'admin.password-changed'));
    res.json({ ok: true });
  });
}
