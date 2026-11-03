import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, money, fmtDate, fmtDateTime, initials } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import { Stars } from '../components/BookCard.jsx';
import { useToast } from '../lib/context.jsx';
import { PageHead, StatusBadge } from './AdminLayout.jsx';

export default function CustomerDetail() {
  const { email } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [c, setC] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [erasing, setErasing] = useState(false);
  const [confirm, setConfirm] = useState('');

  const load = useCallback(() => api(`/admin/customers/${encodeURIComponent(email)}`).then(setC).catch((e) => setErr(e.message)), [email]);
  useEffect(() => { load(); }, [load]);

  const addNote = async (e) => {
    e.preventDefault();
    try { await api(`/admin/customers/${encodeURIComponent(email)}/notes`, { method: 'POST', body: { note } }); setNote(''); load(); } catch (er) { toast(er.message, 'err'); }
  };
  const delNote = async (id) => { try { await api(`/admin/customers/${encodeURIComponent(email)}/notes/${id}`, { method: 'DELETE' }); load(); } catch (er) { toast(er.message, 'err'); } };
  const erase = async () => {
    try {
      const r = await api(`/admin/customers/${encodeURIComponent(email)}/erase`, { method: 'POST', body: { confirm } });
      toast(`Personal data erased (${r.orders} orders anonymised)`); nav('/admin/customers');
    } catch (er) { toast(er.message, 'err'); }
  };

  if (err) return <div className="error-box">{err}</div>;
  if (!c) return <div className="skeleton" style={{ height: 400 }} />;

  return (
    <>
      <Link to="/admin/customers" className="muted" style={{ fontSize: 13 }}>← All customers</Link>
      <PageHead title={c.name} sub={c.email}>
        <a className="btn btn-ghost" href={`mailto:${c.email}`}><Icon name="mail" size={16} /> Email</a>
      </PageHead>

      <div className="kpis">
        {[['Lifetime spend', money(c.spent)], ['Orders', c.orders], ['Avg. order', money(c.aov)], ['Refunded', money(c.refunded)], ['Downloads', c.downloads], ['Customer since', fmtDate(c.first_order)]].map(([l, v]) => (
          <div className="card kpi" key={l}><div className="lbl">{l}</div><div className="val" style={{ fontSize: 24 }}>{v}</div></div>
        ))}
      </div>

      <div className="crm-grid">
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card">
            <div className="panel-head" style={{ padding: '22px 24px 0' }}><h3>Orders</h3></div>
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Order</th><th>Date</th><th>Items</th><th>Status</th><th className="num">Total</th></tr></thead>
              <tbody>
                {c.orderRows.map((o) => (
                  <tr key={o.id}>
                    <td><Link to={`/admin/orders/${o.id}`} style={{ color: 'var(--gold)', fontWeight: 600 }}>{o.number}</Link><div className="muted" style={{ fontSize: 12 }}>{o.invoice_no}</div></td>
                    <td className="muted">{fmtDateTime(o.created_at)}</td>
                    <td className="muted">{o.items.map((i) => i.title).join(', ')}</td>
                    <td><StatusBadge status={o.status} approval={o.approval_status} /></td>
                    <td className="num"><b>{money(o.total_cents)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>

          <div className="card card-pad">
            <div className="panel-head"><h3>Feedback</h3></div>
            {c.feedback.length === 0 && <p className="muted">No reviews or messages from this customer.</p>}
            {c.feedback.map((f) => (
              <div className="review" key={f.id}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {f.type === 'review' ? <><Stars rating={f.rating} /><span className="muted" style={{ fontSize: 13 }}>on {f.book_title}</span></> : <span className="badge">Message</span>}
                  <span className="muted" style={{ fontSize: 12.5, marginLeft: 'auto' }}>{fmtDate(f.created_at)}</span>
                </div>
                <p style={{ fontSize: 14 }}>{f.message}</p>
                {f.reply && <div className="reply"><small className="muted">Your reply</small><br />{f.reply}</div>}
              </div>
            ))}
            {c.feedback.length > 0 && <Link to="/admin/feedback" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}>Open feedback inbox</Link>}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card card-pad">
            <div className="panel-head"><h3>Internal notes</h3><small>Only admins see these</small></div>
            <form onSubmit={addNote} className="form-stack">
              <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Requested a refund by phone; sent corporate invoice…" maxLength={1000} />
              <div><button className="btn btn-gold btn-sm" disabled={!note.trim()}><Icon name="note" size={15} /> Add note</button></div>
            </form>
            {c.notes.map((n) => (
              <div className="review" key={n.id} style={{ gap: 4 }}>
                <p style={{ fontSize: 14 }}>{n.note}</p>
                <div className="muted" style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}><span>{n.author} · {fmtDateTime(n.created_at)}</span><button onClick={() => delNote(n.id)} aria-label="Delete note" style={{ color: 'var(--faint)' }}><Icon name="trash" size={14} /></button></div>
              </div>
            ))}
          </div>

          <div className="card card-pad">
            <div className="panel-head"><h3>Purchased titles</h3></div>
            {c.books.length ? <ul style={{ paddingLeft: 18, fontSize: 14, display: 'grid', gap: 6 }}>{c.books.map((b) => <li key={b}>{b}</li>)}</ul> : <p className="muted">None.</p>}
          </div>

          <div className="card card-pad">
            <div className="panel-head"><h3>Privacy</h3></div>
            <p className="muted" style={{ fontSize: 13.5, marginBottom: 12 }}>On a data-deletion request, erase this customer’s name and email. Financial records are kept in anonymised form for accounting and tax.</p>
            {!erasing
              ? <button className="btn btn-danger btn-sm" onClick={() => setErasing(true)}>Erase personal data…</button>
              : <div className="form-stack">
                  <div className="field"><label>Type {c.email} to confirm</label><input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
                  <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-danger btn-sm" disabled={confirm.toLowerCase() !== c.email} onClick={erase}>Erase permanently</button><button className="btn btn-ghost btn-sm" onClick={() => { setErasing(false); setConfirm(''); }}>Cancel</button></div>
                </div>}
          </div>
        </div>
      </div>
    </>
  );
}
