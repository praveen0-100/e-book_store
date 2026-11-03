import { createContext, useContext, useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, Link, useNavigate } from 'react-router-dom';
import { api, initials } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import { useConfig } from '../lib/context.jsx';

const AdminCtx = createContext(null);
export const useAdmin = () => useContext(AdminCtx);

const LINKS = [
  ['/admin', 'chart', 'Dashboard', true],
  ['/admin/approvals', 'check-circle', 'Approvals', false, 'approvals'],
  ['/admin/orders', 'orders', 'Orders'],
  ['/admin/invoices', 'invoice', 'Invoices'],
  ['/admin/books', 'book', 'Books'],
  ['/admin/feedback', 'message', 'Feedback', false, 'feedback'],
  ['/admin/customers', 'users', 'Customers'],
  ['/admin/coupons', 'tag', 'Promotions'],
  ['/admin/settings', 'settings', 'Settings'],
  ['/admin/system', 'shield', 'System'],
];

export default function AdminLayout() {
  const { store_name } = useConfig();
  const nav = useNavigate();
  const [user, setUser] = useState(undefined);
  const [badges, setBadges] = useState({});

  // Sidebar counters refresh every minute so new work shows up without reloading.
  useEffect(() => {
    if (!user) return undefined;
    const load = () => api('/admin/overview').then((o) => setBadges({ approvals: o.attention.paymentApprovals + o.attention.invoiceApprovals, feedback: o.attention.reviewsToModerate + o.attention.messagesToAnswer })).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [user]);

  useEffect(() => {
    api('/admin/me').then(setUser).catch(() => setUser(null));
    document.title = 'Admin — ' + store_name;
  }, [store_name]);

  if (user === undefined) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><span className="spinner" style={{ width: 32, height: 32 }} /></div>;
  if (user === null) return <Navigate to="/admin/login" replace />;

  const logout = async () => { await api('/admin/logout', { method: 'POST' }); nav('/admin/login'); };

  return (
    <AdminCtx.Provider value={user}>
      <div className="admin">
        <aside className="sidebar">
          <Link to="/admin" className="logo"><span className="logo-mark"><Icon name="book" size={19} stroke={2.2} /></span>{store_name}</Link>
          <div className="side-label">Manage</div>
          {LINKS.map(([to, ic, label, end, badge]) => (
            <NavLink key={to} to={to} end={end} className="side-link"><Icon name={ic} size={19} /><span>{label}</span>{badge && badges[badge] > 0 && <em className="side-badge">{badges[badge]}</em>}</NavLink>
          ))}
          <div className="side-label">Store</div>
          <a className="side-link" href="/" target="_blank" rel="noreferrer"><Icon name="eye" size={19} /><span>View storefront</span></a>
          <div className="side-foot">
            <span className="avatar">{initials(user.name)}</span>
            <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 14 }}>{user.name}</b><small>{user.email}</small></div>
            <button className="icon-btn" onClick={logout} aria-label="Sign out" title="Sign out"><Icon name="logout" size={16} /></button>
          </div>
        </aside>
        <main className="admin-main"><Outlet /></main>
      </div>
    </AdminCtx.Provider>
  );
}

export function PageHead({ title, sub, children }) {
  return (
    <div className="admin-top">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

export function StatusBadge({ status, approval }) {
  if (status === 'paid' && approval === 'pending') return <span className="badge gold">Awaiting approval</span>;
  if (approval === 'rejected') return <span className="badge red">Rejected</span>;
  return <span className={`badge ${status === 'paid' ? 'green' : 'red'}`}>{status === 'paid' ? 'Paid' : status === 'pending' ? 'Pending' : 'Refunded'}</span>;
}

/** Shared pager for admin tables. */
export function Pager({ data, page, setPage }) {
  if (!data || data.pages <= 1) return null;
  return (
    <div className="pager">
      <span>{data.total.toLocaleString()} results · page {data.page} of {data.pages}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <button className="btn btn-ghost btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}
