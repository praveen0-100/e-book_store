import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, money, fmtDateTime, payLabel } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import BookCover from '../components/BookCover.jsx';
import NotFound from './NotFound.jsx';

export default function OrderPage() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const [order, setOrder] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => { api(`/orders/${token}`).then(setOrder).catch(() => setMissing(true)); }, [token]);
  // A payment can be confirmed a few seconds late (webhook): keep checking while the order is pending.
  const pending = order?.status === 'pending';
  useEffect(() => {
    if (!pending) return undefined;
    const t = setInterval(() => api(`/orders/${token}`).then(setOrder).catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [pending, token]);

  if (missing) return <NotFound />;
  if (!order) return <div className="container" style={{ padding: 80 }}><div className="skeleton" style={{ height: 300 }} /></div>;
  if (pending) {
    return (
      <div className="container" style={{ maxWidth: 640, padding: '80px 0', textAlign: 'center' }}>
        <span className="spinner" />
        <h1 style={{ fontSize: 32, margin: '18px 0 8px' }}>Confirming your payment…</h1>
        <p className="muted">{order.number} is waiting for confirmation from the payment provider. This page updates automatically. If you were not charged, you can safely <Link to="/cart" style={{ textDecoration: 'underline' }}>return to your cart</Link>.</p>
      </div>
    );
  }
  const refunded = order.status === 'refunded';
  const awaiting = order.status === 'paid' && order.approval_status === 'pending';

  return (
    <div className="container" style={{ maxWidth: 820, paddingBottom: 80 }}>
      <div className="success-hero fade-in">
        <div className="tick" style={refunded ? { color: 'var(--red)', borderColor: 'rgba(255,122,138,.4)', background: 'rgba(255,122,138,.1)' } : undefined}><Icon name={refunded ? 'refresh' : 'check'} size={38} stroke={2.4} /></div>
        <span className="eyebrow">{order.number}</span>
        <h1 style={{ fontSize: 46, margin: '10px 0' }}>{refunded ? (order.approval_status === 'rejected' ? 'This order could not be completed' : 'This order was refunded') : awaiting ? 'Payment received' : params.get('new') ? 'Thank you, ' + order.name.split(' ')[0] + '!' : 'Your order'}</h1>
        <p className="muted">{refunded ? (order.approval_status === 'rejected' ? `Your payment was refunded${order.reject_reason ? `: ${order.reject_reason}` : '.'}` : 'Downloads are no longer available for this order.') : <>A confirmation has been sent to <b style={{ color: 'var(--text)' }}>{order.email}</b>. Bookmark this page to download your books any time.</>}</p>
      </div>

      {awaiting && (
        <div className="dl-pending" style={{ marginBottom: 20 }}>
          <Icon name="clock" size={22} />
          <div><b>Your payment was received and is being verified.</b><p className="muted" style={{ fontSize: 14, marginTop: 4 }}>Downloads unlock as soon as we approve your order — usually within a few hours. We will email {order.email}; you can also bookmark this page.</p></div>
        </div>
      )}
      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 22, marginBottom: 6 }}>Your downloads</h3>
        {order.items.map((i) => (
          <div className="dl-row" key={i.id}>
            <BookCover book={{ title: i.title, author: i.author, category: '', color_a: '#1c1c2b', color_b: '#d4af6a' }} />
            <div><b className="serif" style={{ fontSize: 18 }}>{i.title}</b><div className="muted" style={{ fontSize: 13 }}>{i.author}</div></div>
            {refunded
              ? <span className="badge red">Refunded</span>
              : awaiting ? <span className="badge gold">Awaiting approval</span>
              : <a className="btn btn-gold btn-sm" href={`/api/download/${token}/${i.id}`}><Icon name="download" size={16} /> Download</a>}
          </div>
        ))}
      </div>

      <div className="card card-pad">
        <div className="panel-head"><h3>Order details</h3>{order.invoice_status === 'issued' ? <Link className="btn btn-ghost btn-sm" to={`/invoice/${token}`}><Icon name="receipt" size={16} /> View invoice</Link> : <span className="badge">Invoice pending</span>}</div>
        <div className="kv">
          <div><span>Order date</span><span>{fmtDateTime(order.created_at)}</span></div>
          <div><span>Payment</span><span>{payLabel(order)}</span></div>
          <div><span>Subtotal</span><span>{money(order.subtotal_cents)}</span></div>
          {order.discount_cents > 0 && <div><span>Discount ({order.coupon})</span><span>−{money(order.discount_cents)}</span></div>}
          <div><span>Tax ({order.tax_rate}%)</span><span>{money(order.tax_cents)}</span></div>
          <div style={{ fontWeight: 700, fontSize: 18, paddingTop: 10, borderTop: '1px solid var(--line-2)' }}><span style={{ color: 'var(--text)' }}>Total</span><span>{money(order.total_cents)}</span></div>
        </div>
      </div>
      <div style={{ textAlign: 'center', marginTop: 34 }}><Link to="/books" className="btn btn-ghost">Continue shopping</Link></div>
    </div>
  );
}
