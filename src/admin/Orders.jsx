import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, money, fmtDate, payLabel } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import { PageHead, StatusBadge } from './AdminLayout.jsx';

/** Orders list. With `invoices` it presents the same data as an invoice register. */
export default function Orders({ invoices = false }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [approval, setApproval] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      api(`/admin/orders?${new URLSearchParams({ q, status, approval, page, limit: 15 })}`).then(setData).catch((e) => setErr(e.message));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, status, approval, page]);
  useEffect(() => { setPage(1); }, [q, status, approval]);

  return (
    <>
      <PageHead title={invoices ? 'Invoices' : 'Orders'} sub={invoices ? 'Register of tax invoices. Open one to review, download the PDF or issue it.' : 'All customer purchases and their payment status.'}>
        <a className="btn btn-ghost" href="/api/admin/orders.csv"><Icon name="download" size={17} /> Export CSV</a>
      </PageHead>
      <div className="filters">
        <input className="input" placeholder="Search invoice #, customer, email or payment ref…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" />
        <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option><option value="paid">Paid</option><option value="failed">Blocked / failed</option><option value="refunded">Refunded</option>
        </select>
      </div>
      {err && <div className="error-box">{err}</div>}
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Order</th>{invoices && <th>Invoice no.</th>}<th>Customer</th><th>Date</th><th>Items</th><th>Payment</th><th>Status</th><th className="num">Total</th><th /></tr></thead>
            <tbody>
              {!data && Array.from({ length: 6 }, (_, i) => <tr key={i}><td colSpan={9}><div className="skeleton" style={{ height: 22 }} /></td></tr>)}
              {data?.rows.map((o) => (
                <tr key={o.id} className="link-row" onClick={() => nav(`/admin/orders/${o.id}`)}>
                  <td style={{ color: 'var(--gold)', fontWeight: 600 }}>{o.number}</td>
                  {invoices && <td>{o.invoice_no || <span className="badge">Not issued</span>}</td>}
                  <td><b style={{ fontWeight: 500 }}>{o.name}</b><div className="muted" style={{ fontSize: 12.5 }}>{o.email}</div></td>
                  <td className="muted">{fmtDate(o.created_at)}</td>
                  <td>{o.item_count}</td>
                  <td className="muted">{payLabel(o)}</td>
                  <td><StatusBadge status={o.status} approval={o.approval_status} /></td>
                  <td className="num"><b>{money(o.total_cents)}</b></td>
                  <td onClick={(e) => e.stopPropagation()}><Link className="btn btn-ghost btn-sm" to={`/admin/orders/${o.id}#invoice`}><Icon name="invoice" size={15} /> Invoice</Link></td>
                </tr>
              ))}
              {data && !data.rows.length && <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 40 }}>No orders match your filters.</td></tr>}
            </tbody>
          </table>
        </div>
        {data && data.pages > 1 && (
          <div className="pager">
            <span>{data.total.toLocaleString()} results · page {data.page} of {data.pages}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <button className="btn btn-ghost btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
