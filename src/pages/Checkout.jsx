import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import { useAuth, useCart, useConfig } from '../lib/context.jsx';
import GoogleSignIn from '../components/GoogleSignIn.jsx';
import { Summary, useQuote } from './Cart.jsx';

/** Loads Razorpay's hosted checkout script once. Card/UPI details are entered inside Razorpay's own secure window. */
let scriptPromise;
const loadRazorpay = () => {
  if (window.Razorpay) return Promise.resolve();
  scriptPromise ||= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = 'https://checkout.razorpay.com/v1/checkout.js';
    el.onload = resolve;
    el.onerror = () => { scriptPromise = null; reject(new Error('Could not load the payment window. Check your connection and try again.')); };
    document.head.appendChild(el);
  });
  return scriptPromise;
};

export default function Checkout() {
  const cart = useCart();
  const nav = useNavigate();
  const config = useConfig();
  const { user } = useAuth();
  const coupon = sessionStorage.getItem('preppath_coupon') || '';
  const { quote } = useQuote(cart.items, coupon);
  const [f, setF] = useState({ name: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  if (!cart.items.length && !busy) return <Navigate to="/cart" replace />;

  const finish = (token) => {
    sessionStorage.removeItem('preppath_coupon');
    cart.clear();
    nav(`/order/${token}?new=1`, { replace: true });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const [o] = await Promise.all([
        api('/checkout', { method: 'POST', body: { ids: cart.items.map((i) => i.id), coupon: coupon || undefined, name: user ? user.name : f.name, email: user ? user.email : f.email } }),
        loadRazorpay(),
      ]);
      const rzp = new window.Razorpay({
        key: o.key_id,
        order_id: o.razorpay_order_id,
        amount: o.amount,
        currency: o.currency,
        name: o.store_name,
        description: `Order ${o.number}`,
        prefill: { name: user ? user.name : f.name, email: user ? user.email : f.email },
        theme: { color: '#d4af6a' },
        modal: { ondismiss: () => setBusy(false) },
        handler: async (r) => {
          try {
            await api('/checkout/verify', { method: 'POST', body: { token: o.token, ...r } });
            finish(o.token);
          } catch (err) {
            setError(`${err.message} Your order reference is ${o.number}.`); setBusy(false);
          }
        },
      });
      rzp.on('payment.failed', (r) => { setError(r.error?.description || 'The payment failed. Please try again.'); setBusy(false); });
      rzp.open();
    } catch (err) {
      setError(err.message); setBusy(false);
    }
  };

  const needLogin = config.require_login && !user;
  const disabled = config.payments_enabled === false || needLogin;

  return (
    <div className="container">
      <div className="page-head"><span className="eyebrow">Step 2 of 2</span><h1>Secure checkout</h1></div>
      <form className="two-col" onSubmit={submit}>
        <div style={{ display: 'grid', gap: 20 }}>
          <div className="card card-pad form-stack">
            <h3 style={{ fontSize: 22 }}>Contact details</h3>
            {user
              ? <div className="ok-box">Logged in as <b>{user.name}</b> ({user.email}). Your receipt and downloads are tied to this account.</div>
              : (
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Link to="/login?next=/checkout" className="btn btn-ghost btn-sm">Log in</Link>
                  <Link to="/signup?next=/checkout" className="btn btn-ghost btn-sm">Sign up</Link>
                  <GoogleSignIn size="medium" text="continue_with" />
                  <span className="muted" style={{ fontSize: 13 }}>{config.require_login ? 'Log in or sign up to continue.' : 'or continue as a guest below.'}</span>
                </div>
              )}
            <div className="grid-2">
              <div className="field"><label htmlFor="name">Full name</label><input id="name" className="input" required autoComplete="name" readOnly={!!user} value={user ? user.name : f.name} onChange={set('name')} placeholder="Your name" /></div>
              <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" className="input" required autoComplete="email" readOnly={!!user} value={user ? user.email : f.email} onChange={set('email')} placeholder="you@example.com" /></div>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>Your invoice and download links are available instantly after payment.</p>
          </div>

          <div className="card card-pad form-stack">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 22 }}>Payment</h3>
              <span className="badge green"><Icon name="lock" size={12} /> Secured by Razorpay</span>
            </div>
            <p className="muted" style={{ fontSize: 14 }}>
              Click <b>Pay now</b> to open the secure payment window. Pay with UPI, credit/debit card, net banking or wallet.
              Your card details are entered with Razorpay and never reach our servers.
            </p>
            {disabled && <div className="error-box" role="alert">Online payments are not available right now. Please contact the store owner.</div>}
          </div>
        </div>

        <Summary quote={quote}>
          <div style={{ display: 'grid', gap: 10 }}>
            {cart.items.map((b) => <div key={b.id} className="sum-row"><span style={{ color: 'var(--text)' }}>{b.title}</span></div>)}
          </div>
          {error && <div className="error-box" role="alert">{error}</div>}
          <button className="btn btn-gold btn-lg btn-block" type="submit" disabled={busy || !quote || disabled}>
            {busy ? <><span className="spinner" /> Processing…</> : <><Icon name="lock" size={17} /> Pay now</>}
          </button>
          <Link to="/cart" className="muted" style={{ fontSize: 13, textAlign: 'center' }}>← Back to cart</Link>
        </Summary>
      </form>
    </div>
  );
}
