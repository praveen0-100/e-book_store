import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, fmtDate } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import GoogleSignIn from '../components/GoogleSignIn.jsx';
import { useAuth, useConfig } from '../lib/context.jsx';

export default function Account() {
  const { user, loading, signOut } = useAuth();
  const { google_client_id } = useConfig();
  const [orders, setOrders] = useState(null);
  useEffect(() => { setOrders(null); if (user) api('/account/orders').then(setOrders).catch(() => setOrders([])); }, [user]);

  if (loading) return <div className="container" style={{ padding: 80 }}><div className="skeleton" style={{ height: 200 }} /></div>;

  if (!user) {
    return (
      <div className="container" style={{ maxWidth: 520, padding: '70px 0 100px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 34 }}>Sign in</h1>
        <p className="muted" style={{ margin: '10px 0 28px' }}>Sign in with Google to see your purchases and re-download your e-books on any device.</p>
        {google_client_id
          ? <div style={{ display: 'flex', justifyContent: 'center' }}><GoogleSignIn /></div>
          : <div className="warn-box" style={{ textAlign: 'left' }}><Icon name="alert" size={18} /><span>Sign-in is not available yet.</span></div>}
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 860, paddingBottom: 90 }}>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {user.picture ? <img src={user.picture} alt="" width={56} height={56} referrerPolicy="no-referrer" style={{ borderRadius: '50%' }} /> : <span className="avatar" style={{ width: 56, height: 56 }}>{user.name[0]}</span>}
          <div><span className="eyebrow">My account</span><h1 style={{ fontSize: 30 }}>{user.name}</h1><div className="muted" style={{ fontSize: 14 }}>{user.email}</div></div>
        </div>
        <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
      </div>

      <h2 style={{ fontSize: 22, margin: '10px 0 14px' }}>Your orders</h2>
      {!orders && <div className="skeleton" style={{ height: 140 }} />}
      {orders && !orders.length && <div className="card card-pad muted" style={{ textAlign: 'center', padding: 44 }}>You have no orders yet. <Link to="/books" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>Browse the library</Link></div>}
      <div style={{ display: 'grid', gap: 14 }}>
        {orders?.map((o) => (
          <div className="card card-pad" key={o.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              <div><b>{o.number}</b> <span className="muted" style={{ fontSize: 13 }}>· {fmtDate(o.created_at)}</span></div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {o.status === 'refunded' ? <span className="badge red">Refunded</span> : o.can_download ? <span className="badge green">Paid</span> : <span className="badge gold">Awaiting approval</span>}
                <b>{money(o.total_cents)}</b>
              </div>
            </div>
            {o.items.map((i) => (
              <div className="dl-row" key={i.id} style={{ padding: '10px 0' }}>
                <div><b>{i.title}</b><div className="muted" style={{ fontSize: 13 }}>{i.author}</div></div>
                {o.can_download && <a className="btn btn-gold btn-sm" href={`/api/download/${o.token}/${i.id}`}><Icon name="download" size={16} /> Download</a>}
              </div>
            ))}
            <div style={{ marginTop: 8 }}><Link to={`/order/${o.token}`} className="muted" style={{ fontSize: 13, textDecoration: 'underline' }}>Order details &amp; invoice</Link></div>
          </div>
        ))}
      </div>
    </div>
  );
}
