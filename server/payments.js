import crypto from 'node:crypto';

/**
 * Razorpay payment gateway (https://razorpay.com/docs/api/).
 *
 * Flow:
 *   1. server  -> createOrder()            creates a Razorpay order for the exact cart total
 *   2. browser -> Razorpay Checkout modal  customer pays by card / UPI / netbanking / wallet.
 *                                          Card details never touch this server.
 *   3. server  -> verifyCheckoutSignature  proves the payment result really came from Razorpay
 *      server  -> fetchPayment             re-checks status, order and amount with Razorpay
 *   4. Razorpay also calls the webhook so an order is fulfilled even if the browser closes early.
 *
 * Env vars: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
 */
const API = process.env.RAZORPAY_API_URL || 'https://api.razorpay.com/v1'; // overridable for tests

export const keyId = () => process.env.RAZORPAY_KEY_ID || '';
const keySecret = () => process.env.RAZORPAY_KEY_SECRET || '';
export const webhookSecret = () => process.env.RAZORPAY_WEBHOOK_SECRET || '';
export const paymentsEnabled = () => Boolean(keyId() && keySecret());

const fail = (message, status = 502) => Object.assign(new Error(message), { status });

async function rzp(path, { method = 'GET', body } = {}) {
  if (!paymentsEnabled()) throw fail('Online payments are not configured yet. Please contact the store owner.', 503);
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${keyId()}:${keySecret()}`).toString('base64'),
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw fail('Could not reach the payment provider. Please try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Razorpay error', res.status, JSON.stringify(data?.error || data));
    throw fail(data?.error?.description || 'The payment provider rejected the request.', res.status === 401 ? 503 : 502);
  }
  return data;
}

/** Create a Razorpay order. `amount` is in the smallest currency unit (paise for INR). */
export function createOrder({ amount, currency, receipt, notes }) {
  return rzp('/orders', { method: 'POST', body: { amount, currency, receipt, notes } });
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

/** Verifies the signature Razorpay Checkout returns to the browser after a successful payment. */
export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) return false;
  return safeEqual(hmac(keySecret(), `${orderId}|${paymentId}`), signature);
}

/** Verifies a webhook call using the raw request body and the webhook secret. */
export function verifyWebhookSignature(rawBody, signature) {
  if (!webhookSecret() || !rawBody || !signature) return false;
  return safeEqual(hmac(webhookSecret(), rawBody), signature);
}

/**
 * Fetches the payment from Razorpay (never trust the browser) and captures it if it is only authorised.
 * Returns the final payment entity.
 */
export async function fetchPayment(paymentId, { amount, currency }) {
  let p = await rzp(`/payments/${encodeURIComponent(paymentId)}`);
  if (p.status === 'authorized') p = await rzp(`/payments/${encodeURIComponent(paymentId)}/capture`, { method: 'POST', body: { amount, currency } });
  return p;
}

/** Refund a captured payment (full amount when `amount` is omitted). */
export function refundPayment(paymentId, amount) {
  return rzp(`/payments/${encodeURIComponent(paymentId)}/refund`, { method: 'POST', body: amount ? { amount } : {} });
}

/** Human-friendly method label + last4 for receipts, taken from a Razorpay payment entity. */
export function describePayment(p) {
  const method = p.method || 'online';
  if (method === 'card') {
    const net = p.card?.network;
    return { brand: net && net !== 'unknown' ? net : 'Card', last4: p.card?.last4 || null };
  }
  const label = { upi: 'UPI', netbanking: 'Net banking', wallet: 'Wallet', emi: 'EMI', paylater: 'Pay Later' }[method] || method;
  return { brand: p.wallet ? `${label} (${p.wallet})` : p.bank ? `${label} (${p.bank})` : label, last4: null };
}
