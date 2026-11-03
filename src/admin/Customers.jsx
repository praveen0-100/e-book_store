import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, money, fmtDate, initials } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import { PageHead } from './AdminLayout.jsx';

export default function Customers() {
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    const t = setTimeout(() => api(`/admin/customers?${new URLSearchParams({ q })}`).then(setRows).catch((e) => setErr(e.message)), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q]);

  const total = rows?.reduce((a, r) => a + r.spent, 0) || 0;
  return (
    <>
      <PageHead title="Customers" sub="Everyone who has purchased from your store. Open a customer for their full history.">
        <a className="btn btn-ghost" href="/api/admin/customers.csv"><Icon name="download" size={17} /> Export CSV</a>
      </PageHead>
      <div className="filters" style={{ alignItems: 'center' }}>
        <input className="input" placeholder="Search by name or email…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
        {rows && <span className="muted" style={{ fontSize: 13 }}>{rows.length.toLocaleString()} customers · {money(total)} lifetime revenue</span>}
      </div>
      {err && <div className="error-box">{err}</div>}
      <div className="card"><div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Customer</th><th className="num">Orders</th><th className="num">Lifetime spend</th><th className="num">Refunded</th><th>Feedback</th><th>First order</th><th>Last order</th></tr></thead>
          <tbody>
            {!rows && <tr><td colSpan={7}><div className="skeleton" style={{ height: 40 }} /></td></tr>}
            {rows?.map((r) => (
              <tr key={r.email} className="link-row" onClick={() => nav(`/admin/customers/${encodeURIComponent(r.email)}`)}>
                <td><div className="cell-book"><span className="avatar">{initials(r.name)}</span><div><b>{r.name}</b><small>{r.email}</small></div></div></td>
                <td className="num">{r.orders}</td>
                <td className="num"><b>{money(r.spent)}</b></td>
                <td className="num muted">{r.refunded ? money(r.refunded) : '—'}</td>
                <td className="muted">{r.feedback || '—'}{r.notes ? <span className="badge" style={{ marginLeft: 8 }}>{r.notes} note{r.notes > 1 ? 's' : ''}</span> : null}</td>
                <td className="muted">{fmtDate(r.first_order)}</td>
                <td className="muted">{fmtDate(r.last_order)}</td>
              </tr>
            ))}
            {rows && !rows.length && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 48 }}>{q ? 'No customers match your search.' : 'No customers yet. They appear here after their first purchase.'}</td></tr>}
          </tbody>
        </table>
      </div></div>
    </>
  );
}
