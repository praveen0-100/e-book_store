import crypto from 'node:crypto';
import { db, tx, getSettings, audit, nextInvoiceNo } from './db.js';
import { describePayment, refundPayment } from './payments.js';
import { sendMail, layout, esc, publicUrl } from './mailer.js';
import { renderInvoicePdf } from './invoice-pdf.js';

export const orderNumber = (id) => `ORD-${1000 + id}`;
const httpErr = (message, status = 400) => Object.assign(new Error(message), { status });

export async function serializeOrder(o) {
  const items = (await db.prepare('SELECT id, book_id, title, author, price_cents, downloads FROM order_items WHERE order_id = ?').all(o.id));
  const { ip: _ip, ...rest } = o;
  return { ...rest, number: orderNumber(o.id), items: items.map((i) => ({ ...i })) };
}
export const getOrder = async (id) => (await db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(id)));

/** Customer may download only when the payment is captured AND (if manual approval is on) approved by an admin. */
export const canDownload = (o) => o.status === 'paid' && o.approval_status === 'approved';

/* ------------------------------------------------------------- emails */
const orderUrl = (o) => `${publicUrl()}/order/${o.token}`;

export async function invoicePdf(o) {
  return renderInvoicePdf({ ...(await serializeOrder(o)) }, getSettings());
}

async function mailReceived(o) {
  await sendMail({
    to: o.email, kind: 'payment-received', subject: `Payment received · ${orderNumber(o.id)}`,
    html: layout('We received your payment', `<p>Hi ${esc(o.name.split(' ')[0])},</p><p>Thank you for your purchase. Your payment of <b>₹${esc((o.total_cents / 100).toFixed(2))}</b> was received and is being verified. We will email you as soon as your downloads and invoice are ready.</p>`, { label: 'View order', url: orderUrl(o) }),
  });
}
async function mailDelivered(o, withInvoice) {
  const attachments = withInvoice ? [{ filename: `${o.invoice_no}.pdf`, content: await invoicePdf(o) }] : undefined;
  await sendMail({
    to: o.email, kind: 'order-delivered', subject: `Your e-books are ready · ${orderNumber(o.id)}`, attachments,
    html: layout('Your e-books are ready', `<p>Hi ${esc(o.name.split(' ')[0])},</p><p>Thank you for shopping with us. Your downloads are available now from your order page${withInvoice ? ', and your tax invoice is attached' : ''}.</p>`, { label: 'Download your e-books', url: orderUrl(o) }),
  });
}
async function mailInvoice(o) {
  await sendMail({
    to: o.email, kind: 'invoice', subject: `Tax invoice ${o.invoice_no}`,
    attachments: [{ filename: `${o.invoice_no}.pdf`, content: await invoicePdf(o) }],
    html: layout('Your tax invoice', `<p>Hi ${esc(o.name.split(' ')[0])},</p><p>Your invoice <b>${esc(o.invoice_no)}</b> for order ${esc(orderNumber(o.id))} is attached.</p>`, { label: 'View order', url: orderUrl(o) }),
  });
}
async function mailRejected(o, reason) {
  await sendMail({
    to: o.email, kind: 'payment-rejected', subject: `Order ${orderNumber(o.id)} could not be completed`,
    html: layout('Your order could not be completed', `<p>Hi ${esc(o.name.split(' ')[0])},</p><p>We were unable to approve your order${reason ? `: <i>${esc(reason)}</i>` : ''}. ${o.payment_method === 'upi_qr' ? 'If any money was deducted, we will refund it to your UPI account — please contact us with your payment reference.' : 'Your payment has been refunded in full and should reach your account within 5–7 working days.'}</p>`),
  });
}
async function mailRefunded(o) {
  await sendMail({
    to: o.email, kind: 'refund', subject: `Refund issued · ${orderNumber(o.id)}`,
    html: layout('Your refund has been issued', `<p>Hi ${esc(o.name.split(' ')[0])},</p><p>We have refunded <b>₹${esc((o.total_cents / 100).toFixed(2))}</b> for order ${esc(orderNumber(o.id))}. It should reach your account within 5–7 working days.</p>`),
  });
}

/* ------------------------------------------------------------ lifecycle */
async function issueInvoiceTx(id, actor) {
  const o = (await getOrder(id));
  if (o.invoice_status === 'issued' && o.invoice_no) return false;
  const no = (await nextInvoiceNo());
  (await db.prepare("UPDATE orders SET invoice_status='issued', invoice_no=?, invoice_issued_at=?, invoice_issued_by=? WHERE id=?").run(no, new Date().toISOString(), actor, id));
  return true;
}

/* ------------------------------------------------- automatic verification */
/** Who gets security alerts: ALERT_EMAIL, the store support email, and the SMTP account (deduplicated). */
export function alertRecipients() {
  const raw = [process.env.ALERT_EMAIL, getSettings().support_email, process.env.SMTP_USER].flatMap((v) => String(v || '').split(/[,;]/));
  return [...new Set(raw.map((v) => v.trim().toLowerCase()).filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)))];
}

/**
 * Independent checks on a payment before anything is delivered. Returns a list of problems (empty = genuine).
 * Everything is compared against our own database and the payment as re-fetched from Razorpay, never browser input.
 */
export async function assessPayment(order, payment) {
  const issues = [];
  if (!payment || payment.status !== 'captured') issues.push(`Payment status is "${payment?.status || 'unknown'}", not captured`);
  if (payment?.order_id !== order.provider_order_id) issues.push('Payment belongs to a different gateway order');
  if (payment?.amount !== order.total_cents) issues.push(`Amount mismatch: paid ${((payment?.amount || 0) / 100).toFixed(2)}, expected ${(order.total_cents / 100).toFixed(2)}`);
  if (String(payment?.currency || '').toUpperCase() !== 'INR') issues.push(`Unexpected currency ${payment?.currency}`);
  if (payment?.id && (await db.prepare('SELECT 1 FROM orders WHERE payment_ref = ? AND id != ?').get(payment.id, order.id))) issues.push('This payment ID was already used on another order');
  const items = await db.prepare('SELECT price_cents FROM order_items WHERE order_id = ?').all(order.id);
  const sum = items.reduce((a, i) => a + i.price_cents, 0);
  if (!items.length || sum !== order.subtotal_cents || order.subtotal_cents - order.discount_cents + order.tax_cents !== order.total_cents) issues.push('Order totals are inconsistent with the items purchased');
  return issues;
}

async function mailFailureToCustomer(o, why) {
  await sendMail({
    to: o.email, kind: 'payment-failed', subject: `Payment not completed · ${orderNumber(o.id)}`,
    html: layout('We could not confirm your payment', `<p>Hi ${esc(o.name.split(' ')[0])},</p><p>We could not confirm your payment for order <b>${esc(orderNumber(o.id))}</b> (${esc(why)}), so your e-books have <b>not</b> been released. If money was deducted from your account, it will be returned automatically by your bank or payment provider, usually within 5–7 working days.</p><p>You are welcome to place the order again, or reply to this email if you need help.</p>`, { label: 'Visit the store', url: publicUrl() }),
  });
}
async function mailAlertToAdmin(o, why, source, extra = '') {
  const to = alertRecipients();
  if (!to.length) { console.error('ALERT (no recipient configured):', orderNumber(o.id), why); return; }
  await sendMail({
    to: to.join(','), kind: 'admin-alert', subject: `Failed / suspicious payment · ${orderNumber(o.id)}`,
    html: layout('Payment alert', `<p>An order was <b>blocked automatically</b> and no e-book was delivered.</p><table style="font-size:14px"><tr><td>Order</td><td><b>${esc(orderNumber(o.id))}</b></td></tr><tr><td>Customer</td><td>${esc(o.name)} &lt;${esc(o.email)}&gt;</td></tr><tr><td>Amount</td><td>₹${esc((o.total_cents / 100).toFixed(2))}</td></tr><tr><td>Reason</td><td>${esc(why)}</td></tr><tr><td>Detected by</td><td>${esc(source)}</td></tr><tr><td>IP</td><td>${esc(o.ip || '—')}</td></tr></table>${extra}`, { label: 'Open in admin', url: `${publicUrl()}/admin/orders/${o.id}` }),
  });
}

/**
 * Blocks an order: marks it failed, keeps downloads locked, optionally refunds a captured payment,
 * and alerts both the admin and the customer. Idempotent: only the first call for an order sends alerts.
 */
export async function flagOrder(order, reasons, source, { refundPaymentId } = {}) {
  const why = [].concat(reasons).join('; ').slice(0, 300);
  const changed = await db.prepare("UPDATE orders SET status='failed', approval_status='rejected', invoice_status='void', reject_reason=? WHERE id=? AND status='pending'").run(why, order.id);
  if (!changed.changes) return false;
  let refundNote = '';
  if (refundPaymentId) {
    try { await refundPayment(refundPaymentId, order.total_cents); refundNote = '<p>The captured amount was refunded automatically.</p>'; await audit('system', 'payment.auto-refunded', orderNumber(order.id), refundPaymentId); }
    catch (e) { refundNote = `<p><b>Automatic refund failed (${esc(e.message)}). Please refund payment ${esc(refundPaymentId)} manually from the Razorpay dashboard.</b></p>`; }
  }
  await audit('system', 'payment.blocked', orderNumber(order.id), `${source}: ${why}`);
  const fresh = await getOrder(order.id);
  await Promise.all([mailAlertToAdmin(fresh, why, source, refundNote), mailFailureToCustomer(fresh, why)].map((p) => p.catch((e) => console.error(e))));
  return true;
}

/** A single failed attempt reported by the gateway. The order stays open (the customer may retry), but both sides are told, once per payment. */
export async function reportFailedAttempt(order, payment) {
  const key = payment?.id || 'unknown';
  if (await db.prepare("SELECT 1 FROM audit_log WHERE action='payment.failed' AND target=? AND detail LIKE ?").get(orderNumber(order.id), `${key}%`)) return false;
  const why = payment?.error_description || payment?.error_reason || 'Payment declined';
  await audit('system', 'payment.failed', orderNumber(order.id), `${key} ${why}`);
  await Promise.all([mailAlertToAdmin(order, why, 'Payment gateway (failed attempt)'), mailFailureToCustomer(order, why)].map((p) => p.catch((e) => console.error(e))));
  return true;
}

/**
 * Called when Razorpay confirms the payment (browser verify and webhook may both arrive: idempotent).
 * Fully automatic: verify the payment, issue the invoice, deliver the e-books. No admin action is ever needed.
 * Anything that does not check out is blocked and alerted instead.
 */
export async function fulfil(order, payment) {
  const issues = await assessPayment(order, payment);
  if (issues.length) {
    await flagOrder(order, issues, 'Automatic payment verification', { refundPaymentId: payment?.status === 'captured' ? payment.id : undefined });
    return false;
  }
  const { brand, last4 } = describePayment(payment);
  const changed = (await tx(async () => {
    const r = (await db.prepare("UPDATE orders SET status='paid', card_brand=?, card_last4=?, payment_ref=?, payment_method='razorpay', approval_status='approved', approved_at=?, approved_by='auto', invoice_status='pending' WHERE id=? AND status='pending'")
      .run(brand, last4, payment.id, new Date().toISOString(), order.id));
    if (!r.changes) return false;
    if (order.coupon) (await db.prepare('UPDATE coupons SET uses = uses + 1 WHERE code = ?').run(order.coupon));
    (await issueInvoiceTx(order.id, 'auto'));
    return true;
  }));
  if (changed) {
    const fresh = (await getOrder(order.id));
    (await audit('system', 'payment.captured', orderNumber(order.id), `${payment.id} ${(order.total_cents / 100).toFixed(2)}`));
    await mailDelivered(fresh, true).catch((e) => console.error(e));
  }
  return changed;
}

export async function approvePayment(id, actor) {
  const o = (await getOrder(id));
  if (!o || o.status !== 'paid') throw httpErr('Only paid orders can be approved.');
  if (o.approval_status === 'approved') throw httpErr('This payment is already approved.');
  (await db.prepare("UPDATE orders SET approval_status='approved', approved_at=?, approved_by=?, reject_reason=NULL WHERE id=?").run(new Date().toISOString(), actor, o.id));
  (await audit(actor, 'payment.approved', orderNumber(o.id)));
  const manualUpi = o.payment_method === 'upi_qr'; // one approval does everything for a hand-verified UPI payment
  if (manualUpi) (await tx(async () => (await issueInvoiceTx(o.id, actor))));
  const fresh = (await getOrder(id));
  (await mailDelivered(fresh, manualUpi).catch((e) => console.error(e)));
  return fresh;
}

/** Rejecting a payment refunds the customer through Razorpay and closes the order. */
export async function rejectPayment(id, actor, reason) {
  const o = (await getOrder(id));
  if (!o || o.status !== 'paid') throw httpErr('Only paid orders can be rejected.');
  if (o.approval_status === 'rejected') throw httpErr('Already rejected.');
  if (o.payment_ref && o.payment_method !== 'upi_qr') await refundPayment(o.payment_ref, o.total_cents); // manual UPI payments are refunded by the owner from their UPI app
  (await db.prepare("UPDATE orders SET status='refunded', refunded_at=?, approval_status='rejected', approved_by=?, approved_at=?, reject_reason=?, invoice_status='void' WHERE id=?")
    .run(new Date().toISOString(), actor, new Date().toISOString(), String(reason || '').slice(0, 300), o.id));
  (await audit(actor, 'payment.rejected', orderNumber(o.id), reason || ''));
  const fresh = (await getOrder(id));
  (await mailRejected(fresh, reason).catch((e) => console.error(e)));
  return fresh;
}

export async function approveInvoice(id, actor) {
  const o = (await getOrder(id));
  if (!o || o.status === 'pending') throw httpErr('Order not found.', 404);
  if (o.approval_status !== 'approved') throw httpErr('Approve the payment before issuing the invoice.');
  if (o.invoice_status === 'issued') throw httpErr('The invoice is already issued.');
  if (o.invoice_status === 'void') throw httpErr('This invoice was voided.');
  (await tx(async () => (await issueInvoiceTx(o.id, actor))));
  (await audit(actor, 'invoice.issued', orderNumber(o.id), (await getOrder(id)).invoice_no));
  const fresh = (await getOrder(id));
  (await mailInvoice(fresh).catch((e) => console.error(e)));
  return fresh;
}

export async function refundOrder(id, actor) {
  const o = (await getOrder(id));
  if (!o) throw httpErr('Order not found', 404);
  if (o.status !== 'paid') throw httpErr('Only paid orders can be refunded.');
  if (o.payment_ref && o.payment_method !== 'upi_qr') await refundPayment(o.payment_ref, o.total_cents);
  (await db.prepare("UPDATE orders SET status='refunded', refunded_at=? WHERE id=?").run(new Date().toISOString(), o.id));
  (await audit(actor, 'order.refunded', orderNumber(o.id), (o.total_cents / 100).toFixed(2)));
  const fresh = (await getOrder(id));
  (await mailRefunded(fresh).catch((e) => console.error(e)));
  return fresh;
}

export async function resendOrderEmail(id, actor) {
  const o = (await getOrder(id));
  if (!o || o.status === 'pending') throw httpErr('Order not found', 404);
  (await audit(actor, 'order.email-resent', orderNumber(o.id)));
  if (o.invoice_status === 'issued') await mailInvoice(o); else await mailReceived(o);
}

/**
 * Manual UPI QR checkout: the customer paid by scanning our QR and typed the 12-digit UPI reference (UTR).
 * The order is stored as paid-but-unapproved, so downloads stay locked until the owner checks the payment and approves it.
 */
export async function placeUpiOrder({ books, p, name, email, utr, ip, customerId }) {
  const token = crypto.randomBytes(20).toString('hex');
  const id = await tx(async () => {
    if (await db.prepare('SELECT 1 FROM orders WHERE payment_ref = ?').get(utr)) throw httpErr('That UPI reference number has already been used on another order.');
    const oid = await db.insert(`INSERT INTO orders (token,email,name,status,subtotal_cents,discount_cents,tax_cents,total_cents,tax_rate,coupon,payment_method,card_brand,payment_ref,approval_status,invoice_status,created_at,ip,customer_id)
      VALUES (?,?,?,'paid',?,?,?,?,?,?,'upi_qr','UPI QR',?,'pending','pending',?,?,?)`, token, email, name, p.subtotal, p.discount, p.tax, p.total, p.taxRate, p.coupon?.code || null, utr, new Date().toISOString(), ip || null, customerId || null);
    for (const bk of books) await db.prepare('INSERT INTO order_items (order_id,book_id,title,author,price_cents) VALUES (?,?,?,?,?)').run(oid, bk.id, bk.title, bk.author, bk.price_cents);
    if (p.coupon) await db.prepare('UPDATE coupons SET uses = uses + 1 WHERE code = ?').run(p.coupon.code);
    return oid;
  });
  await audit('system', 'payment.upi-submitted', orderNumber(id), `UTR ${utr} ${(p.total / 100).toFixed(2)}`);
  const fresh = await getOrder(id);
  await mailReceived(fresh).catch((e) => console.error(e));
  return fresh;
}

/** Free books: no payment, no invoice. The order is stored as paid and approved so the normal download links work. */
export async function placeFreeOrder({ books, name, email, ip, customerId }) {
  const token = crypto.randomBytes(20).toString('hex');
  const now = new Date().toISOString();
  const id = await tx(async () => {
    const oid = await db.insert(`INSERT INTO orders (token,email,name,status,subtotal_cents,discount_cents,tax_cents,total_cents,tax_rate,coupon,payment_method,card_brand,approval_status,approved_at,approved_by,invoice_status,created_at,ip,customer_id)
      VALUES (?,?,?,'paid',0,0,0,0,0,NULL,'free','Free','approved',?,'auto','none',?,?,?)`, token, email, name, now, now, ip || null, customerId || null);
    for (const bk of books) await db.prepare('INSERT INTO order_items (order_id,book_id,title,author,price_cents) VALUES (?,?,?,?,?)').run(oid, bk.id, bk.title, bk.author, 0);
    return oid;
  });
  await audit('system', 'order.free', orderNumber(id), books.map((b) => b.title).join(', ').slice(0, 200));
  const fresh = await getOrder(id);
  await mailDelivered(fresh, false).catch((e) => console.error(e));
  return fresh;
}
