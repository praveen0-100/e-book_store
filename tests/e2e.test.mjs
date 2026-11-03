/**
 * End-to-end tests: boots the real server on a temp data dir, with a local fake Razorpay API.
 * Run with:  npm test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const KEY_SECRET = 'test_secret';
const GOOGLE_CLIENT = 'test-client.apps.googleusercontent.com';
const gkeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const gjwk = { ...gkeys.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const idToken = (over = {}, key = gkeys.privateKey) => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const body = b({ iss: 'https://accounts.google.com', aud: GOOGLE_CLIENT, sub: 'g-123', email: 'Googler@Example.com', email_verified: true, name: 'Gita Googler', picture: 'https://lh3.googleusercontent.com/x', exp: Math.floor(Date.now() / 1000) + 600, ...over });
  return `${head}.${body}.${crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url')}`;
};
const WH_SECRET = 'whsec_test';
const PORT = 4300, RZP_PORT = 4301;
const base = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preppath-test-'));

let server, rzp, cookie, book;
const rzpState = { orders: new Map(), payments: new Map(), refunds: [] };

const json = (body) => ({ 'Content-Type': 'application/json', ...(body ? {} : {}) });
async function call(p, { method = 'GET', body, headers = {}, admin = false, raw = false } = {}) {
  const res = await fetch(base + p, { method, headers: { ...(body && !(body instanceof FormData) ? json() : {}), ...(admin ? { cookie } : {}), ...headers }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  if (raw) return res;
  let data = null; try { data = await res.json(); } catch { /* not json */ }
  return { status: res.status, data };
}
/** Admin settings are changed through the real API (the database engine is single-process, so tests never open it directly). */
const setSetting = async (k, v) => {
  const cur = (await call('/api/admin/settings', { admin: true })).data;
  const r = await call('/api/admin/settings', { method: 'PUT', body: { ...cur, [k]: v }, admin: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
};
const auditActions = async () => (await call('/api/admin/audit', { admin: true })).data.rows.map((r) => r.action);
const paidTotals = async () => {
  const rows = (await call('/api/admin/orders?status=paid&limit=100', { admin: true })).data.rows;
  return { c: rows.length, s: rows.reduce((a, r) => a + r.total_cents, 0) };
};

/** Simulates a customer paying through Razorpay Checkout; returns the order token. */
async function buy({ email = 'buyer@example.com', name = 'Test Buyer', coupon, ids } = {}) {
  const c = await call('/api/checkout', { method: 'POST', body: { ids: ids || [book.id], name, email, coupon } });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  const paymentId = 'pay_' + crypto.randomBytes(6).toString('hex');
  rzpState.payments.set(paymentId, { id: paymentId, order_id: c.data.razorpay_order_id, amount: c.data.amount, status: 'captured', method: 'card', card: { network: 'Visa', last4: '4242' } });
  const sig = crypto.createHmac('sha256', KEY_SECRET).update(`${c.data.razorpay_order_id}|${paymentId}`).digest('hex');
  return { ...c.data, paymentId, sig };
}
const verify = (o, over = {}) => call('/api/checkout/verify', { method: 'POST', body: { token: o.token, razorpay_order_id: o.razorpay_order_id, razorpay_payment_id: o.paymentId, razorpay_signature: o.sig, ...over } });

before(async () => {
  // fake Razorpay
  rzp = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
      if (req.url === '/certs') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ keys: [gjwk] })); }
      const url = req.url.replace('/v1', ''); const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.method === 'POST' && url === '/orders') { const d = JSON.parse(b); const o = { id: 'order_' + crypto.randomBytes(5).toString('hex'), ...d }; rzpState.orders.set(o.id, o); return send(200, o); }
      let m = url.match(/^\/payments\/([^/]+)\/refund$/);
      if (m && req.method === 'POST') { rzpState.refunds.push({ payment: m[1], ...JSON.parse(b || '{}') }); return send(200, { id: 'rfnd_1' }); }
      m = url.match(/^\/payments\/([^/]+)$/);
      if (m && rzpState.payments.has(m[1])) return send(200, rzpState.payments.get(m[1]));
      send(404, { error: { description: 'not found' } });
    });
  });
  await new Promise((r) => rzp.listen(RZP_PORT, r));

  server = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(), stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_PASSWORD: 'correct-horse-battery', RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: KEY_SECRET, RAZORPAY_WEBHOOK_SECRET: WH_SECRET, RAZORPAY_API_URL: `http://localhost:${RZP_PORT}/v1`, GOOGLE_CLIENT_ID: GOOGLE_CLIENT, GOOGLE_JWKS_URL: `http://localhost:${RZP_PORT}/certs`, SMTP_HOST: '', SMTP_FROM: '' },
  });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 150)); }

  const login = await fetch(base + '/api/admin/login', { method: 'POST', headers: json(), body: JSON.stringify({ email: 'admin@preppath.store', password: 'correct-horse-battery' }) });
  cookie = login.headers.get('set-cookie').split(';')[0];
  const fd = new FormData();
  Object.entries({ title: 'Test Book', author: 'Author', price: '500', category: 'Test', published: 'true' }).forEach(([k, v]) => fd.append(k, v));
  fd.append('ebook', new Blob(['%PDF-1.4 the real file']), 'book.pdf');
  book = (await call('/api/admin/books', { method: 'POST', body: fd, admin: true })).data;
});

after(async () => {
  server?.kill(); rzp?.close();
  await new Promise((r) => setTimeout(r, 500)); // let the server release its data files (Windows)
  try { fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp dir; the OS cleans it up */ }
});

test('store starts empty and branded', async () => {
  const cfg = (await call('/api/config')).data;
  assert.equal(cfg.store_name, 'PrepPath E-books Store');
  assert.equal(cfg.payments_enabled, true);
});

test('admin API requires login', async () => {
  for (const p of ['/api/admin/overview', '/api/admin/feedback', '/api/admin/customers', '/api/admin/approvals', '/api/admin/audit', '/api/admin/backup']) {
    assert.equal((await call(p)).status, 401, p);
  }
});

test('cannot publish a book without a file; upload type allowlist enforced', async () => {
  const fd = new FormData(); Object.entries({ title: 'X', author: 'Y', price: '10', published: 'true' }).forEach(([k, v]) => fd.append(k, v));
  assert.equal((await call('/api/admin/books', { method: 'POST', body: fd, admin: true })).status, 400);
  const bad = new FormData(); Object.entries({ title: 'X', author: 'Y', price: '10', published: 'false' }).forEach(([k, v]) => bad.append(k, v));
  bad.append('ebook', new Blob(['MZ']), 'virus.exe');
  assert.equal((await call('/api/admin/books', { method: 'POST', body: bad, admin: true })).status, 400);
});

test('auto mode: pay -> verified -> instant download + numbered invoice PDF', async () => {
  const o = await buy();
  assert.equal(o.amount, 50000);
  assert.equal((await verify(o, { razorpay_signature: 'forged' })).status, 400, 'forged signature rejected');
  assert.equal((await call(`/api/download/${o.token}/1`, { raw: true })).status, 403, 'no download before payment confirmed');
  assert.equal((await verify(o)).status, 200);
  const order = (await call(`/api/orders/${o.token}`)).data;
  assert.equal(order.status, 'paid'); assert.equal(order.approval_status, 'approved'); assert.equal(order.invoice_status, 'issued');
  assert.match(order.invoice_no, /^INV-\d{4}-00001$/);
  assert.equal(order.card_last4, '4242');
  const dl = await call(`/api/download/${o.token}/${order.items[0].id}`, { raw: true });
  assert.equal(dl.status, 200); assert.match(await dl.text(), /the real file/);
  const pdf = await call(`/api/orders/${o.token}/invoice.pdf`, { raw: true });
  assert.equal(pdf.status, 200); assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  assert.equal((await verify(o)).status, 200, 'verify is idempotent');
});

test('server recomputes the price and rejects amount mismatch', async () => {
  const o = await buy({ email: 'tamper@example.com' });
  rzpState.payments.get(o.paymentId).amount = 100; // customer somehow paid less
  assert.equal((await verify(o)).status, 402);
  assert.equal((await call(`/api/orders/${o.token}`)).data.status, 'pending');
});

test('webhook completes an order the browser never confirmed', async () => {
  const o = await buy({ email: 'closed-tab@example.com' });
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: rzpState.payments.get(o.paymentId) } } });
  const bad = await call('/api/webhooks/razorpay', { method: 'POST', body: JSON.parse(body), headers: { 'x-razorpay-signature': 'nope' } });
  assert.equal(bad.status, 400);
  const sig = crypto.createHmac('sha256', WH_SECRET).update(body).digest('hex');
  const ok = await fetch(base + '/api/webhooks/razorpay', { method: 'POST', headers: { ...json(), 'x-razorpay-signature': sig }, body });
  assert.equal(ok.status, 200);
  assert.equal((await call(`/api/orders/${o.token}`)).data.status, 'paid');
});

test('manual approval mode: hold -> approve payment -> issue invoice', async () => {
  await setSetting('require_approval', 'true');
  const o = await buy({ email: 'manual@example.com', name: 'Manual Buyer' });
  assert.equal((await verify(o)).status, 200);
  let order = (await call(`/api/orders/${o.token}`)).data;
  assert.equal(order.approval_status, 'pending'); assert.equal(order.invoice_status, 'pending');
  assert.equal((await call(`/api/download/${o.token}/${order.items[0].id}`, { raw: true })).status, 403, 'download held');
  assert.equal((await call(`/api/orders/${o.token}/invoice.pdf`, { raw: true })).status, 404, 'invoice held');

  const q = (await call('/api/admin/approvals?tab=payments', { admin: true })).data;
  assert.ok(q.rows.some((r) => r.token === o.token));
  const id = q.rows.find((r) => r.token === o.token).id;
  assert.equal((await call(`/api/admin/orders/${id}/issue-invoice`, { method: 'POST', admin: true })).status, 400, 'invoice needs payment approval first');
  assert.equal((await call(`/api/admin/orders/${id}/approve-payment`, { method: 'POST', admin: true })).status, 200);
  assert.equal((await call(`/api/download/${o.token}/${order.items[0].id}`, { raw: true })).status, 200, 'download released');
  const q2 = (await call('/api/admin/approvals?tab=invoices', { admin: true })).data;
  assert.ok(q2.rows.some((r) => r.token === o.token));
  const inv = await call(`/api/admin/orders/${id}/issue-invoice`, { method: 'POST', admin: true });
  assert.equal(inv.status, 200); assert.match(inv.data.invoice_no, /^INV-\d{4}-0000\d$/);
  assert.equal((await call(`/api/orders/${o.token}/invoice.pdf`, { raw: true })).status, 200);
  assert.ok((await auditActions()).includes('payment.approved'));
});

test('rejecting a payment refunds it through Razorpay and blocks downloads', async () => {
  await setSetting('require_approval', 'true');
  const o = await buy({ email: 'reject@example.com' });
  await verify(o);
  const placed = (await call(`/api/orders/${o.token}`)).data; const id = placed.id;
  const r = await call(`/api/admin/orders/${id}/reject-payment`, { method: 'POST', body: { reason: 'Duplicate' }, admin: true });
  assert.equal(r.status, 200); assert.equal(r.data.status, 'refunded'); assert.equal(r.data.approval_status, 'rejected'); assert.equal(r.data.invoice_status, 'void');
  assert.ok(rzpState.refunds.some((x) => x.payment === o.paymentId && x.amount === 50000));
  assert.equal((await call(`/api/download/${o.token}/${placed.items[0].id}`, { raw: true })).status, 403);
  await setSetting('require_approval', 'false');
});

test('plain refund of an approved order', async () => {
  const o = await buy({ email: 'refund@example.com' });
  await verify(o);
  const id = (await call(`/api/orders/${o.token}`)).data.id;
  const r = await call(`/api/admin/orders/${id}/refund`, { method: 'POST', admin: true });
  assert.equal(r.status, 200); assert.equal(r.data.status, 'refunded');
  assert.equal((await call(`/api/admin/orders/${id}/refund`, { method: 'POST', admin: true })).status, 400, 'cannot refund twice');
});

test('feedback: moderation, public listing, reply, rating recompute', async () => {
  const mk = (extra) => call('/api/feedback', { method: 'POST', body: { type: 'review', book_id: book.id, name: 'Rita Rao', email: 'buyer@example.com', rating: 4, message: 'Really useful book.', ...extra } });
  assert.equal((await mk({ rating: 9 })).status, 400);
  assert.equal((await mk({ website: 'http://spam' })).status, 200, 'honeypot silently accepted');
  assert.equal((await call('/api/admin/feedback', { admin: true })).data.total, 0, 'honeypot not stored');
  assert.equal((await mk()).status, 200);
  assert.equal((await mk()).status, 409, 'one review per email per book');
  assert.equal((await call(`/api/books/${book.slug}/reviews`)).data.reviews.length, 0, 'pending reviews not public');

  const list = (await call('/api/admin/feedback?type=review', { admin: true })).data;
  const f = list.rows[0];
  assert.equal(f.verified, 1, 'buyer@example.com purchased the book');
  assert.equal((await call(`/api/admin/feedback/${f.id}`, { method: 'PUT', body: { status: 'published' }, admin: true })).status, 200);
  const pub = (await call(`/api/books/${book.slug}/reviews`)).data;
  assert.equal(pub.reviews.length, 1); assert.equal(pub.reviews[0].name, 'Rita R.'); assert.ok(!('email' in pub.reviews[0]));
  assert.equal((await call(`/api/books/${book.slug}`)).data.rating, 4);

  const rep = await call(`/api/admin/feedback/${f.id}/reply`, { method: 'POST', body: { reply: 'Thanks Rita!' }, admin: true });
  assert.equal(rep.status, 200); assert.equal(rep.data.emailed, false, 'no SMTP configured');
  assert.equal((await call(`/api/books/${book.slug}/reviews`)).data.reviews[0].reply, 'Thanks Rita!');
  assert.ok((await call('/api/admin/email-log', { admin: true })).data.some((e) => e.kind === 'feedback-reply' && e.status === 'skipped'), 'skipped email is logged');

  const msg = await call('/api/feedback', { method: 'POST', body: { type: 'message', name: 'Q', email: 'q@example.com', subject: 'Help', message: 'Cannot open my file' } });
  assert.equal(msg.status, 200);
  const att = (await call('/api/admin/overview', { admin: true })).data.attention;
  assert.equal(att.messagesToAnswer, 1);
});

test('customers: profile, notes, CSV, erasure', async () => {
  const list = (await call('/api/admin/customers', { admin: true })).data;
  assert.ok(list.find((c) => c.email === 'buyer@example.com'));
  const prof = (await call('/api/admin/customers/buyer%40example.com', { admin: true })).data;
  assert.equal(prof.name, 'Test Buyer'); assert.ok(prof.orderRows.length >= 1); assert.equal(prof.feedback.length, 1); assert.ok(prof.downloads >= 1);
  assert.equal((await call('/api/admin/customers/buyer%40example.com/notes', { method: 'POST', body: { note: 'VIP' }, admin: true })).status, 200);
  assert.equal((await call('/api/admin/customers/buyer%40example.com', { admin: true })).data.notes[0].note, 'VIP');
  const csv = await call('/api/admin/customers.csv', { admin: true, raw: true });
  assert.match(await csv.text(), /buyer@example.com/);

  assert.equal((await call('/api/admin/customers/refund%40example.com/erase', { method: 'POST', body: { confirm: 'wrong' }, admin: true })).status, 400);
  assert.equal((await call('/api/admin/customers/refund%40example.com/erase', { method: 'POST', body: { confirm: 'refund@example.com' }, admin: true })).status, 200);
  const after = (await call('/api/admin/customers', { admin: true })).data;
  assert.ok(!after.some((c) => c.email === 'refund@example.com'), 'personal data gone');
  assert.ok(after.some((c) => c.name === 'Erased customer'), 'financial record kept, anonymised');
});

test('analytics: overview, daily report and CSV agree with orders', async () => {
  const ov = (await call('/api/admin/overview', { admin: true })).data;
  const paid = await paidTotals();
  assert.equal(ov.today.orders, paid.c); assert.equal(ov.today.revenue, paid.s);
  const daily = (await call('/api/admin/daily?days=3', { admin: true })).data;
  assert.equal(daily.length, 3); assert.equal(daily[0].revenue, paid.s);
  const an = (await call('/api/admin/analytics?days=7', { admin: true })).data;
  assert.equal(an.cur.revenue, paid.s);
  const csv = await (await call('/api/admin/daily.csv?days=3', { admin: true, raw: true })).text();
  assert.match(csv, /Date,Revenue/);
  assert.ok((await call('/api/admin/activity', { admin: true })).data.length > 0);
});

test('system: warnings, audit log, backup, password change', async () => {
  const sys = (await call('/api/admin/system', { admin: true })).data;
  assert.equal(sys.payments.enabled, true); assert.equal(sys.email.enabled, false);
  assert.ok(sys.warnings.some((w) => /SMTP/.test(w)));
  const audit = (await call('/api/admin/audit', { admin: true })).data;
  assert.ok(audit.total > 5);
  const bk = await call('/api/admin/backup', { admin: true, raw: true });
  assert.equal(bk.status, 200); const dump = JSON.parse(await bk.text()); assert.ok(dump.tables.orders.length > 0 && dump.tables.books.length > 0);
  assert.equal((await call('/api/admin/password', { method: 'POST', body: { current: 'bad', next: 'a-new-long-password' }, admin: true })).status, 400);
  assert.equal((await call('/api/admin/password', { method: 'POST', body: { current: 'correct-horse-battery', next: 'short' }, admin: true })).status, 400);
});

test('security headers, health and CSV injection guard', async () => {
  const r = await call('/api/health', { raw: true });
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('content-security-policy'), /checkout\.razorpay\.com/);
  const c = await call('/api/checkout', { method: 'POST', body: { ids: [book.id], name: '=HYPERLINK("http://evil")', email: 'inj@example.com' } });
  assert.equal(c.status, 200);
  const csv = await (await call('/api/admin/orders.csv', { admin: true, raw: true })).text();
  assert.ok(!/(^|,)"?=HYPERLINK/.test(csv.split('\n').slice(1).join('\n')), 'formula not exported raw');
});

test('Google sign-in: token verification, session, account orders, identity binding', async () => {
  assert.equal((await call('/api/config')).data.google_client_id, GOOGLE_CLIENT);
  const post = (credential) => call('/api/auth/google', { method: 'POST', body: { credential }, raw: true });

  assert.equal((await post('garbage')).status, 401);
  assert.equal((await post(idToken({ aud: 'someone-elses-app' }))).status, 401, 'wrong audience');
  assert.equal((await post(idToken({ iss: 'https://evil.example' }))).status, 401, 'wrong issuer');
  assert.equal((await post(idToken({ exp: Math.floor(Date.now() / 1000) - 3600 }))).status, 401, 'expired');
  assert.equal((await post(idToken({ email_verified: false }))).status, 401, 'unverified email');
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  assert.equal((await post(idToken({}, other.privateKey))).status, 401, 'forged signature');

  const ok = await post(idToken());
  assert.equal(ok.status, 200);
  const user = (await ok.json()).user;
  assert.equal(user.email, 'googler@example.com'); assert.equal(user.name, 'Gita Googler');
  const uc = ok.headers.get('set-cookie').split(';')[0];
  assert.match(ok.headers.get('set-cookie'), /HttpOnly/i);
  assert.equal((await call('/api/auth/me', { headers: { cookie: uc } })).data.user.email, 'googler@example.com');
  assert.equal((await call('/api/auth/me')).data.user, null);

  // a customer session must never grant admin access
  assert.equal((await call('/api/admin/overview', { headers: { cookie: uc } })).status, 401);
  assert.equal((await call('/api/account/orders')).status, 401);

  // checkout binds to the verified Google identity, ignoring any email the browser sends
  const c = await call('/api/checkout', { method: 'POST', headers: { cookie: uc }, body: { ids: [book.id], name: 'Spoof', email: 'victim@example.com' } });
  assert.equal(c.status, 200);
  const row = (await call(`/api/orders/${c.data.token}`)).data;
  assert.equal(row.email, 'googler@example.com'); assert.equal(row.name, 'Gita Googler');
  const paymentId = 'pay_g1';
  rzpState.payments.set(paymentId, { id: paymentId, order_id: c.data.razorpay_order_id, amount: c.data.amount, status: 'captured', method: 'upi' });
  const sig = crypto.createHmac('sha256', KEY_SECRET).update(`${c.data.razorpay_order_id}|${paymentId}`).digest('hex');
  assert.equal((await call('/api/checkout/verify', { method: 'POST', body: { token: c.data.token, razorpay_order_id: c.data.razorpay_order_id, razorpay_payment_id: paymentId, razorpay_signature: sig } })).status, 200);
  const mine = (await call('/api/account/orders', { headers: { cookie: uc } })).data;
  assert.equal(mine.length, 1); assert.equal(mine[0].can_download, true);

  assert.equal((await call('/api/auth/logout', { method: 'POST', headers: { cookie: uc } })).status, 200);
});
