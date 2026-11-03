export async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (form) opts.body = form;
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch('/api' + path, opts);
  } catch {
    throw new Error('Cannot reach the server. Please check your connection.');
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

let currency = 'USD';
export const setCurrency = (c) => { currency = c || 'USD'; };
export const money = (cents = 0) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
export const moneyShort = (cents = 0) => {
  const v = cents / 100;
  if (Math.abs(v) >= 1000) return new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(v);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
};
export const fmtDate = (iso, opts = { month: 'short', day: 'numeric', year: 'numeric' }) =>
  new Date(iso).toLocaleDateString('en-US', opts);
export const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
export const pct = (cur, prev) => (prev ? ((cur - prev) / prev) * 100 : cur ? 100 : 0);
export const initials = (n = '') => n.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

/** "Visa •••• 4242", "UPI", "Net banking (HDFC)" ... */
export const payLabel = (o) => (o.card_last4 ? `${o.card_brand || 'Card'} •••• ${o.card_last4}` : o.card_brand || '—');
