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
    html: layout('We received your payment', `<p>Hi ${esc(o.name.split(' ')[0])},</p><p>Thank you for your purchase. Your payment of <b>${esc((o.total_cents / 100).toFixed(2))} ${esc(getSettings().currency)}</b> was received and is being reviewed. We will email you as soon as your downloads and invoice are ready.</p>`, { label: 'View order', url: orderUrl(o) }),
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
    html: layout('Your order could not be completed', `<p>Hi ${esc(o.name.split(' ')[0])},</p><p>We were unable to approve your order${reason ? `: <i>${esc(reason)}</i>` : ''}. Your payment has been refunded in full and should reach your account within 5–7 working days.</p>`),
  });
}
async function mailRefunded(o) {
  await sendMail({
    to: o.email, kind: 'refund', subject: `Refund issued · ${orderNumber(o.id)}`,
    html: layout('Your refund has been issued', `<p>Hi ${esc(o.name.split(' ')[0])},</p><p>We have refunded <b>${esc((o.total_cents / 100).toFixed(2))} ${esc(getSettings().currency)}</b> for order ${esc(orderNumber(o.id))}. It should reach your account within 5–7 working days.</p>`),
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

/**
 * Called when Razorpay confirms the payment. Idempotent (browser verify + webhook can both arrive).
 * Auto mode: approve + issue invoice + deliver immediately. Manual mode: hold for admin approval.
 */
export async function fulfil(order, payment) {
  const { brand, last4 } = describePayment(payment);
  const manual = getSettings().require_approval === 'true';
  const changed = (await tx(async () => {
    const r = (await db.prepare("UPDATE orders SET status='paid', card_brand=?, card_last4=?, payment_ref=?, payment_method='razorpay', approval_status=?, invoice_status='pending' WHERE id=? AND status='pending'")
      .run(brand, last4, payment.id, manual ? 'pending' : 'approved', order.id));
    if (!r.changes) return false;
    if (order.coupon) (await db.prepare('UPDATE coupons SET uses = uses + 1 WHERE code = ?').run(order.coupon));
    if (!manual) {
      (await db.prepare("UPDATE orders SET approved_at=?, approved_by='auto' WHERE id=?").run(new Date().toISOString(), order.id));
      (await issueInvoiceTx(order.id, 'auto'));
    }
    return true;
  }));
  if (changed) {
    const fresh = (await getOrder(order.id));
    (await audit('system', 'payment.captured', orderNumber(order.id), `${payment.id} ${(order.total_cents / 100).toFixed(2)}`));
    await (manual ? mailReceived(fresh) : mailDelivered(fresh, true)).catch((e) => console.error(e));
  }
  return changed;
}

export async function approvePayment(id, actor) {
  const o = (await getOrder(id));
  if (!o || o.status !== 'paid') throw httpErr('Only paid orders can be approved.');
  if (o.approval_status === 'approved') throw httpErr('This payment is already approved.');
  (await db.prepare("UPDATE orders SET approval_status='approved', approved_at=?, approved_by=?, reject_reason=NULL WHERE id=?").run(new Date().toISOString(), actor, o.id));
  (await audit(actor, 'payment.approved', orderNumber(o.id)));
  const fresh = (await getOrder(id));
  (await mailDelivered(fresh, false).catch((e) => console.error(e)));
  return fresh;
}

/** Rejecting a payment refunds the customer through Razorpay and closes the order. */
export async function rejectPayment(id, actor, reason) {
  const o = (await getOrder(id));
  if (!o || o.status !== 'paid') throw httpErr('Only paid orders can be rejected.');
  if (o.approval_status === 'rejected') throw httpErr('Already rejected.');
  if (o.payment_ref) await refundPayment(o.payment_ref, o.total_cents);
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
  if (o.payment_ref) await refundPayment(o.payment_ref, o.total_cents);
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
