import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, money } from '../lib/api.js';
import BookCover from '../components/BookCover.jsx';
import { Icon } from '../components/Icon.jsx';
import { useCart } from '../lib/context.jsx';

/** Shared order summary (also used on the checkout page). */
export function useQuote(items, coupon) {
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const key = items.map((i) => i.id).join(',') + '|' + (coupon || '');
  useEffect(() => {
    if (!items.length) { setQuote(null); return; }
    api('/cart/quote', { method: 'POST', body: { ids: items.map((i) => i.id), coupon } })
      .then((q) => { setQuote(q); setError(''); })
      .catch((e) => { setError(e.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { quote, error };
}

export function Summary({ quote, children }) {
  return (
    <aside className="card summary">
      <h3 style={{ fontSize: 22 }}>Order summary</h3>
      {quote ? (
        <>
          <div className="sum-row"><span>Subtotal</span><span>{money(quote.subtotal_cents)}</span></div>
          {quote.discount_cents > 0 && <div className="sum-row disc"><span>Promo {quote.coupon} (−{quote.percent}%)</span><span>−{money(quote.discount_cents)}</span></div>}
          <div className="sum-row"><span>Tax ({quote.tax_rate}%)</span><span>{money(quote.tax_cents)}</span></div>
          <div className="sum-row total"><span>Total</span><span>{money(quote.total_cents)}</span></div>
        </>
      ) : <div className="skeleton" style={{ height: 110 }} />}
      {children}
    </aside>
  );
}

export default function Cart() {
  const cart = useCart();
  const nav = useNavigate();
  const [input, setInput] = useState('');
  const [coupon, setCoupon] = useState(() => sessionStorage.getItem('preppath_coupon') || '');
  const [msg, setMsg] = useState('');
  const { quote, error } = useQuote(cart.items, coupon);

  useEffect(() => {
    if (error && coupon) { setMsg(error); setCoupon(''); sessionStorage.removeItem('preppath_coupon'); }
  }, [error, coupon]);

  const apply = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    try {
      await api('/cart/quote', { method: 'POST', body: { ids: cart.items.map((i) => i.id), coupon: input } });
      setCoupon(input.trim().toUpperCase());
      sessionStorage.setItem('preppath_coupon', input.trim().toUpperCase());
      setMsg(''); setInput('');
    } catch (err) { setMsg(err.message); }
  };

  if (!cart.items.length) {
    return (
      <div className="container empty" style={{ padding: '120px 0' }}>
        <Icon name="bag" size={48} />
        <h2 className="serif" style={{ fontSize: 36 }}>Your cart is empty</h2>
        <p>Great books are waiting for you.</p>
        <Link to="/books" className="btn btn-gold" style={{ marginTop: 24 }}>Browse the library</Link>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-head"><span className="eyebrow">Step 1 of 2</span><h1>Your cart</h1></div>
      <div className="two-col">
        <div className="card card-pad">
          {cart.items.map((b) => (
            <div className="cart-row" key={b.id}>
              <Link to={`/books/${b.slug}`}><BookCover book={b} /></Link>
              <div>
                <Link to={`/books/${b.slug}`}><b className="serif" style={{ fontSize: 19 }}>{b.title}</b></Link>
                <div className="muted" style={{ fontSize: 13 }}>{b.author} · Digital edition</div>
              </div>
              <b>{money(b.price_cents)}</b>
              <button className="icon-btn" onClick={() => cart.remove(b.id)} aria-label={`Remove ${b.title}`}><Icon name="trash" size={16} /></button>
            </div>
          ))}
        </div>
        <Summary quote={quote}>
          {coupon ? (
            <div className="ok-box" style={{ display: 'flex', justifyContent: 'space-between' }}>Code {coupon} applied<button onClick={() => { setCoupon(''); sessionStorage.removeItem('preppath_coupon'); }} style={{ textDecoration: 'underline' }}>Remove</button></div>
          ) : (
            <form className="promo" onSubmit={apply}>
              <input className="input" placeholder="Promo code" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Promo code" />
              <button className="btn btn-ghost" type="submit">Apply</button>
            </form>
          )}
          {msg && <div className="error-box">{msg}</div>}
          <button className="btn btn-gold btn-lg btn-block" onClick={() => nav('/checkout')} disabled={!quote}>Continue to checkout <Icon name="arrow" size={18} /></button>
          <div className="muted" style={{ fontSize: 12.5, textAlign: 'center' }}><Icon name="lock" size={13} style={{ verticalAlign: -2 }} /> Secure, encrypted checkout</div>
        </Summary>
      </div>
    </div>
  );
}
