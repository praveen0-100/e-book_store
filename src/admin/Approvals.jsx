import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, fmtDateTime, payLabel } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import { useToast } from '../lib/context.jsx';
import { PageHead } from './AdminLayout.jsx';

/** Work queue: payments waiting for approval, and approved payments waiting for an invoice to be issued. */
export default function Approvals() {
  const toast = useToast();
  const [tab, setTab] = useState('payments');
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api(`/admin/approvals?tab=${tab}`).then((d) => { setData(d); setSel(new Set()); }).catch((e) => toast(e.message, 'err')), [tab]); // eslint-disable-line
  useEffect(() => { setData(null); load(); }, [load]);

  const act = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); toast(okMsg); await load(); } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };
  const approve = (o) => act(() => api(`/admin/orders/${o.id}/approve-payment`, { method: 'POST' }), `${o.number} approved — customer notified`);
  const issue = (o) => act(() => api(`/admin/orders/${o.id}/issue-invoice`, { method: 'POST' }), `Invoice issued for ${o.number}`);
  const reject = () => act(async () => { await api(`/admin/orders/${rejecting.id}/reject-payment`, { method: 'POST', body: { reason } }); setRejecting(null); setReason(''); }, 'Payment rejected and refunded');
  const bulk = (action) => act(async () => {
    const r = await api('/admin/approvals/bulk', { method: 'POST', body: { action, ids: [...sel] } });
    if (r.failed.length) throw new Error(`${r.done} done, ${r.failed.length} failed: ${r.failed[0].error}`);
  }, `${sel.size} processed`);

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const rows = data?.rows || [];
  const allOn = rows.length > 0 && sel.size === rows.length;

  return (
    <>
      <PageHead title="Approvals" sub="Review payments before customers get their downloads, then approve the tax invoice." />
      {data && !data.requireApproval && (
        <div className="warn-box" style={{ marginBottom: 18 }}><Icon name="alert" size={18} />
          <span>Manual approval is <b>off</b>: new payments are approved and invoiced automatically. Turn it on in <Link to="/admin/settings" style={{ textDecoration: 'underline' }}>Settings</Link> to review each order first.</span>
        </div>
      )}
      <div className="tabs" role="tablist">
        <button className={tab === 'payments' ? 'on' : ''} onClick={() => setTab('payments')}>Payment approval {data && <span className="count">{data.counts.payments}</span>}</button>
        <button className={tab === 'invoices' ? 'on' : ''} onClick={() => setTab('invoices')}>Invoice approval {data && <span className="count">{data.counts.invoices}</span>}</button>
      </div>

      {sel.size > 0 && (
        <div className="filters" style={{ alignItems: 'center' }}>
          <span className="muted">{sel.size} selected</span>
          <button className="btn btn-gold btn-sm" disabled={busy} onClick={() => bulk(tab === 'payments' ? 'approve-payment' : 'issue-invoice')}>{tab === 'payments' ? 'Approve selected' : 'Issue selected invoices'}</button>
        </div>
      )}

      <div className="card"><div className="table-wrap">
        <table className="tbl">
          <thead><tr>
            <th style={{ width: 36 }}><input type="checkbox" aria-label="Select all" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
            <th>Order</th><th>Customer</th><th>Received</th><th>Items</th><th>Payment</th><th className="num">Total</th><th style={{ width: 230 }} />
          </tr></thead>
          <tbody>
            {!data && <tr><td colSpan={8}><div className="skeleton" style={{ height: 40 }} /></td></tr>}
            {rows.map((o) => (
              <tr key={o.id}>
                <td><input type="checkbox" aria-label={`Select ${o.number}`} checked={sel.has(o.id)} onChange={() => toggle(o.id)} /></td>
                <td><Link to={`/admin/orders/${o.id}`} style={{ color: 'var(--gold)', fontWeight: 600 }}>{o.number}</Link></td>
                <td><b style={{ fontWeight: 500 }}>{o.name}</b><div className="muted" style={{ fontSize: 12.5 }}>{o.email}</div></td>
                <td className="muted nowrap">{fmtDateTime(o.created_at)}</td>
                <td className="muted" style={{ maxWidth: 220 }}>{o.items.map((i) => i.title).join(', ')}</td>
                <td className="muted">{payLabel(o)}<div style={{ fontSize: 11.5 }}>{o.payment_ref}</div></td>
                <td className="num"><b>{money(o.total_cents)}</b></td>
                <td style={{ textAlign: 'right' }}>
                  {tab === 'payments'
                    ? <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-gold btn-sm" disabled={busy} onClick={() => approve(o)}><Icon name="check" size={15} /> Approve</button>
                        <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => { setRejecting(o); setReason(''); }}>Reject &amp; refund</button>
                      </div>
                    : <button className="btn btn-gold btn-sm" disabled={busy} onClick={() => issue(o)}><Icon name="invoice" size={15} /> Issue invoice</button>}
                </td>
              </tr>
            ))}
            {data && !rows.length && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 48 }}>Nothing waiting — you’re all caught up. 🎉</td></tr>}
          </tbody>
        </table>
      </div></div>

      {rejecting && (
        <div className="card card-pad form-stack" style={{ marginTop: 18, maxWidth: 560 }} role="dialog" aria-label="Reject payment">
          <h3 style={{ fontSize: 18 }}>Reject {rejecting.number} and refund {money(rejecting.total_cents)}?</h3>
          <p className="muted" style={{ fontSize: 13.5 }}>The full amount is refunded to the customer through Razorpay and they are emailed. This cannot be undone.</p>
          <div className="field"><label>Reason (shown to the customer)</label><textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Suspected duplicate payment" /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-danger" disabled={busy} onClick={reject}>{busy ? <span className="spinner" /> : 'Reject & refund'}</button>
            <button className="btn btn-ghost" onClick={() => setRejecting(null)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
