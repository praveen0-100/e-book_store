import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDateTime } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import { Stars } from '../components/BookCard.jsx';
import { useToast } from '../lib/context.jsx';
import { PageHead, Pager } from './AdminLayout.jsx';

const BADGE = { pending: ['gold', 'Awaiting moderation'], published: ['green', 'Published'], hidden: ['red', 'Hidden'], new: ['gold', 'New'], resolved: ['green', 'Resolved'] };

function Item({ f, onChange }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(f.reply || '');
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [b, label] = BADGE[f.status] || ['', f.status];

  const setStatus = async (status) => {
    try { await api(`/admin/feedback/${f.id}`, { method: 'PUT', body: { status } }); toast('Updated'); onChange(); } catch (e) { toast(e.message, 'err'); }
  };
  const send = async () => {
    setBusy(true);
    try {
      const r = await api(`/admin/feedback/${f.id}/reply`, { method: 'POST', body: { reply: text } });
      toast(r.emailed ? 'Reply saved and emailed to the customer' : 'Reply saved (email not sent — SMTP is not configured)', r.emailed ? 'ok' : 'err');
      setOpen(false); onChange();
    } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };
  const del = async () => { try { await api(`/admin/feedback/${f.id}`, { method: 'DELETE' }); toast('Deleted'); onChange(); } catch (e) { toast(e.message, 'err'); } };

  return (
    <div className="fb-item">
      <div className="fb-head">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <b>{f.name}</b>
          <Link to={`/admin/customers/${encodeURIComponent(f.email)}`} className="muted" style={{ fontSize: 13 }}>{f.email}</Link>
          {f.type === 'review' ? <span className="badge">Review</span> : <span className="badge">Message</span>}
          {f.verified ? <span className="badge green">Verified buyer</span> : null}
          <span className={`badge ${b}`}>{label}</span>
        </div>
        <span className="muted" style={{ fontSize: 12.5 }}>{fmtDateTime(f.created_at)}</span>
      </div>
      {f.type === 'review' && <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Stars rating={f.rating} /> <span className="muted" style={{ fontSize: 13 }}>on</span> <Link to={`/books/${f.book_slug}`} target="_blank" style={{ color: 'var(--gold)', fontSize: 13.5 }}>{f.book_title}</Link></div>}
      {f.subject && <b style={{ fontSize: 14.5 }}>{f.subject}</b>}
      <div className="fb-msg">{f.message}</div>
      {f.reply && !open && <div className="fb-reply"><small>Replied by {f.replied_by} · {fmtDateTime(f.replied_at)}</small>{f.reply}</div>}

      {open && (
        <div className="form-stack">
          <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Reply to ${f.name.split(' ')[0]}…`} maxLength={3000} autoFocus />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn btn-gold btn-sm" disabled={busy || text.trim().length < 2} onClick={send}>{busy ? <span className="spinner" /> : <><Icon name="mail" size={15} /> Send reply</>}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <span className="muted" style={{ fontSize: 12.5 }}>{f.type === 'review' ? 'Your reply is shown publicly under the review and emailed to the author.' : 'Your reply is emailed to the customer.'}</span>
          </div>
        </div>
      )}

      {!open && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}><Icon name="reply" size={15} /> {f.reply ? 'Edit reply' : 'Reply'}</button>
          {f.type === 'review' && f.status !== 'published' && <button className="btn btn-gold btn-sm" onClick={() => setStatus('published')}>Publish</button>}
          {f.type === 'review' && f.status !== 'hidden' && <button className="btn btn-ghost btn-sm" onClick={() => setStatus('hidden')}>Hide</button>}
          {f.type === 'message' && f.status !== 'resolved' && <button className="btn btn-ghost btn-sm" onClick={() => setStatus('resolved')}>Mark resolved</button>}
          {f.type === 'message' && f.status === 'resolved' && <button className="btn btn-ghost btn-sm" onClick={() => setStatus('new')}>Reopen</button>}
          {confirmDel
            ? <><button className="btn btn-danger btn-sm" onClick={del}>Confirm delete</button><button className="btn btn-ghost btn-sm" onClick={() => setConfirmDel(false)}>Cancel</button></>
            : <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDel(true)}><Icon name="trash" size={15} /></button>}
        </div>
      )}
    </div>
  );
}

export default function Feedback() {
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => api(`/admin/feedback?${new URLSearchParams({ type, status, q, page })}`).then(setData).catch((e) => setErr(e.message)), [type, status, q, page]);
  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);
  useEffect(() => { setPage(1); }, [type, status, q]);

  const preset = (t, s) => () => { setType(t); setStatus(s); };
  const c = data?.counts;

  return (
    <>
      <PageHead title="Feedback" sub="Customer reviews and messages. Moderate, reply publicly or by email." />
      <div className="tabs">
        <button className={!type && !status ? 'on' : ''} onClick={preset('', '')}>All {c && <span className="count">{c.all}</span>}</button>
        <button className={status === 'pending' ? 'on' : ''} onClick={preset('review', 'pending')}>Reviews to moderate {c && <span className="count">{c.pending}</span>}</button>
        <button className={type === 'message' && status === 'new' ? 'on' : ''} onClick={preset('message', 'new')}>New messages {c && <span className="count">{c.newMessages}</span>}</button>
        <button className={status === 'unanswered' ? 'on' : ''} onClick={preset('', 'unanswered')}>Unanswered {c && <span className="count">{c.unanswered}</span>}</button>
      </div>
      <div className="filters">
        <input className="input" placeholder="Search name, email or text…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search feedback" />
        <select className="input" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Type"><option value="">All types</option><option value="review">Reviews</option><option value="message">Messages</option></select>
      </div>
      {err && <div className="error-box">{err}</div>}
      <div className="card">
        {!data && <div style={{ padding: 22 }}><div className="skeleton" style={{ height: 90 }} /></div>}
        {data?.rows.map((f) => <Item key={`${f.id}-${f.status}-${f.reply}`} f={f} onChange={load} />)}
        {data && !data.rows.length && <div className="muted" style={{ textAlign: 'center', padding: 56 }}>No feedback here yet. Reviews and messages from customers will appear in this inbox.</div>}
        <Pager data={data} page={page} setPage={setPage} />
      </div>
    </>
  );
}
