import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, money, fmtDateTime, payLabel } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import Invoice from '../components/Invoice.jsx';
import { useToast } from '../lib/context.jsx';
import { PageHead, StatusBadge } from './AdminLayout.jsx';

export default function OrderDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [o, setO] = useState(null);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState(null); // 'refund' | 'reject'
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api(`/admin/orders/${id}`).then(setO).catch((e) => setErr(e.message)); }, [id]);
  useEffect(() => {
    if (o && window.location.hash === '#invoice') document.getElementById('invoice-section')?.scrollIntoView();
  }, [o]);

  const run = async (path, body, okMsg) => {
    setBusy(true);
    try {
      const r = await api(`/admin/orders/${id}/${path}`, { method: 'POST', body });
      if (r.id) setO((cur) => ({ ...cur, ...r }));
      toast(okMsg);
      if (!r.id) toast(r.emailEnabled ? 'Email sent' : 'Email logged but not sent — SMTP is not configured', r.emailEnabled ? 'ok' : 'err');
    } catch (e) { toast(e.message, 'err'); }
    setBusy(false); setMode(null); setReason('');
  };

  if (err) return <div className="error-box">{err}</div>;
  if (!o) return <div className="skeleton" style={{ height: 400 }} />;

  const paid = o.status === 'paid';
  const awaitingPayment = paid && o.approval_status === 'pending';
  const awaitingInvoice = paid && o.approval_status === 'approved' && o.invoice_status === 'pending';

  return (
    <>
      <div className="no-print">
        <Link to="/admin/orders" className="muted" style={{ fontSize: 13 }}>← All orders</Link>
        <PageHead title={o.number} sub={`Placed ${fmtDateTime(o.created_at)}${o.invoice_no ? ` · Invoice ${o.invoice_no}` : ''}`}>
          <StatusBadge status={o.status} approval={o.approval_status} />
          <a className="btn btn-ghost" href={`/api/admin/orders/${o.id}/invoice.pdf`} target="_blank" rel="noreferrer"><Icon name="download" size={16} /> Invoice PDF</a>
          <button className="btn btn-ghost" disabled={busy} onClick={() => run('resend', undefined, 'Resending…')}><Icon name="mail" size={16} /> Resend email</button>
          {paid && o.approval_status !== 'pending' && mode !== 'refund' && <button className="btn btn-danger" onClick={() => setMode('refund')}><Icon name="refresh" size={16} /> Refund</button>}
        </PageHead>

        {awaitingPayment && (
          <div className="warn-box" style={{ marginBottom: 16, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <span><b>Payment awaiting your approval.</b> The money is captured; the customer cannot download until you approve.</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-gold btn-sm" disabled={busy} onClick={() => run('approve-payment', undefined, 'Payment approved — customer notified')}><Icon name="check" size={15} /> Approve payment</button>
              <button className="btn btn-danger btn-sm" onClick={() => setMode('reject')}>Reject &amp; refund</button>
            </span>
          </div>
        )}
        {awaitingInvoice && (
          <div className="warn-box" style={{ marginBottom: 16, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <span><b>Invoice not issued yet.</b> Issuing assigns the next invoice number and emails the PDF to the customer.</span>
            <button className="btn btn-gold btn-sm" disabled={busy} onClick={() => run('issue-invoice', undefined, 'Invoice issued')}><Icon name="invoice" size={15} /> Approve &amp; issue invoice</button>
          </div>
        )}
        {mode && (
          <div className="card card-pad form-stack" style={{ marginBottom: 16, maxWidth: 560 }}>
            <h3 style={{ fontSize: 18 }}>{mode === 'refund' ? 'Refund' : 'Reject and refund'} {money(o.total_cents)}?</h3>
            <p className="muted" style={{ fontSize: 13.5 }}>The full amount goes back to the customer through Razorpay and they are emailed. This cannot be undone.</p>
            {mode === 'reject' && <div className="field"><label>Reason (shown to the customer)</label><textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-danger" disabled={busy} onClick={() => (mode === 'refund' ? run('refund', undefined, 'Order refunded') : run('reject-payment', { reason }, 'Payment rejected and refunded'))}>{busy ? <span className="spinner" /> : 'Confirm'}</button>
              <button className="btn btn-ghost" onClick={() => setMode(null)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="detail-grid">
          <div className="card card-pad"><div className="panel-head"><h3>Customer</h3></div>
            <div className="kv"><div><span>Name</span><span>{o.name}</span></div><div><span>Email</span><Link to={`/admin/customers/${encodeURIComponent(o.email)}`} style={{ color: 'var(--gold)' }}>{o.email}</Link></div></div></div>
          <div className="card card-pad"><div className="panel-head"><h3>Payment</h3></div>
            <div className="kv"><div><span>Method</span><span>{payLabel(o)}</span></div><div><span>Reference</span><span style={{ fontSize: 12.5 }}>{o.payment_ref}</span></div><div><span>Coupon</span><span>{o.coupon || '—'}</span></div></div></div>
          <div className="card card-pad"><div className="panel-head"><h3>Timeline</h3></div>
            <div className="timeline">
              <div><i /><span>Payment captured<br /><small className="muted">{fmtDateTime(o.created_at)}</small></span></div>
              {o.approval_status === 'approved' && <div><i /><span>Payment approved by {o.approved_by}<br /><small className="muted">{o.approved_at ? fmtDateTime(o.approved_at) : ''} · {o.items.reduce((a, i) => a + i.downloads, 0)} downloads so far</small></span></div>}
              {o.approval_status === 'pending' && <div><i className="red" /><span>Waiting for payment approval</span></div>}
              {o.invoice_status === 'issued' && <div><i /><span>Invoice {o.invoice_no} issued by {o.invoice_issued_by}<br /><small className="muted">{o.invoice_issued_at ? fmtDateTime(o.invoice_issued_at) : ''}</small></span></div>}
              {o.approval_status === 'rejected' && <div><i className="red" /><span>Rejected by {o.approved_by}{o.reject_reason ? `: ${o.reject_reason}` : ''}</span></div>}
              {o.refunded_at && <div><i className="red" /><span>Refunded<br /><small className="muted">{fmtDateTime(o.refunded_at)}</small></span></div>}
            </div></div>
        </div>
      </div>

      <div id="invoice-section" style={{ marginTop: 28 }}>
        <Invoice order={o} admin />
      </div>
    </>
  );
}
