import { useCallback, useEffect, useState } from 'react';
import { api, fmtDateTime } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import { useToast } from '../lib/context.jsx';
import { PageHead, Pager } from './AdminLayout.jsx';

const fmtBytes = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fmtUptime = (s) => (s > 86400 ? `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h` : s > 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m`);

function Status({ ok, children, hint }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}><span><i className={`status-dot ${ok ? 'ok' : 'bad'}`} />{children}</span><span className="muted" style={{ textAlign: 'right' }}>{hint}</span></div>;
}

function Overview() {
  const toast = useToast();
  const [s, setS] = useState(null);
  const [to, setTo] = useState('');
  useEffect(() => { api('/admin/system').then(setS).catch((e) => toast(e.message, 'err')); }, []); // eslint-disable-line
  if (!s) return <div className="skeleton" style={{ height: 300 }} />;
  const test = async () => { try { await api('/admin/email-test', { method: 'POST', body: { to } }); toast('Test email sent'); } catch (e) { toast(e.message, 'err'); } };
  return (
    <>
      {s.warnings.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
          {s.warnings.map((w) => <div className="warn-box" key={w}><Icon name="alert" size={18} /><span>{w}</span></div>)}
        </div>
      )}
      <div className="sys-grid">
        <div className="card card-pad form-stack">
          <h3 style={{ fontSize: 17 }}>Integrations</h3>
          <Status ok={s.payments.enabled} hint={s.payments.enabled ? `${s.payments.mode.toUpperCase()} mode` : 'Add RAZORPAY_KEY_ID / KEY_SECRET'}>Razorpay payments</Status>
          <Status ok={s.payments.webhook} hint={s.payments.webhook ? 'Secret configured' : 'Add RAZORPAY_WEBHOOK_SECRET'}>Payment webhook</Status>
          <Status ok={s.email.enabled} hint={s.email.enabled ? s.email.host : 'Add SMTP_* variables'}>Email (SMTP)</Status>
          <Status ok={Boolean(s.publicUrl) && !s.publicUrl.includes('localhost')} hint={s.publicUrl}>Public URL</Status>
          {s.payments.webhook && <p className="muted" style={{ fontSize: 12.5 }}>Webhook URL: <code>{s.publicUrl}/api/webhooks/razorpay</code></p>}
        </div>
        <div className="card card-pad form-stack">
          <h3 style={{ fontSize: 17 }}>Server</h3>
          <div className="kv">
            <div><span>Uptime</span><span>{fmtUptime(s.uptime)}</span></div>
            <div><span>Node</span><span>{s.node}</span></div>
            <div><span>Database size</span><span>{fmtBytes(s.dbSize)}</span></div>
            <div><span>Books / orders / feedback</span><span>{s.counts.books} / {s.counts.orders} / {s.counts.feedback}</span></div>
          </div>
          <a className="btn btn-ghost btn-sm" href="/api/admin/backup"><Icon name="download" size={15} /> Download data export (JSON)</a>
          <p className="muted" style={{ fontSize: 12.5 }}>For point-in-time recovery use your database provider's backups (Neon keeps history automatically). E-books and covers live in cloud storage.</p>
        </div>
        <div className="card card-pad form-stack">
          <h3 style={{ fontSize: 17 }}>Send a test email</h3>
          <div className="field"><label>To</label><input className="input" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Defaults to your admin email" /></div>
          <div><button className="btn btn-ghost btn-sm" onClick={test}><Icon name="mail" size={15} /> Send test</button></div>
        </div>
      </div>
    </>
  );
}

function Audit() {
  const [page, setPage] = useState(1);
  const [d, setD] = useState(null);
  useEffect(() => { api(`/admin/audit?page=${page}`).then(setD); }, [page]);
  return (
    <div className="card"><div className="table-wrap"><table className="tbl">
      <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead>
      <tbody>
        {!d && <tr><td colSpan={5}><div className="skeleton" style={{ height: 30 }} /></td></tr>}
        {d?.rows.map((r) => <tr key={r.id}><td className="muted nowrap">{fmtDateTime(r.at)}</td><td>{r.actor}</td><td><span className="badge">{r.action}</span></td><td>{r.target}</td><td className="muted">{r.detail}</td></tr>)}
      </tbody>
    </table></div><Pager data={d} page={page} setPage={setPage} /></div>
  );
}

function EmailLog() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api('/admin/email-log').then(setRows); }, []);
  return (
    <div className="card"><div className="table-wrap"><table className="tbl">
      <thead><tr><th>When</th><th>To</th><th>Subject</th><th>Type</th><th>Status</th></tr></thead>
      <tbody>
        {!rows && <tr><td colSpan={5}><div className="skeleton" style={{ height: 30 }} /></td></tr>}
        {rows?.map((r) => (
          <tr key={r.id}><td className="muted nowrap">{fmtDateTime(r.at)}</td><td>{r.to_addr}</td><td>{r.subject}</td><td className="muted">{r.kind}</td>
            <td><span className={`badge ${r.status === 'sent' ? 'green' : r.status === 'failed' ? 'red' : ''}`} title={r.error}>{r.status}</span></td></tr>
        ))}
        {rows && !rows.length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 40 }}>No emails yet.</td></tr>}
      </tbody>
    </table></div></div>
  );
}

function Security() {
  const toast = useToast();
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (f.next !== f.again) return toast('The new passwords do not match.', 'err');
    setBusy(true);
    try { await api('/admin/password', { method: 'POST', body: { current: f.current, next: f.next } }); toast('Password changed'); setF({ current: '', next: '', again: '' }); } catch (er) { toast(er.message, 'err'); }
    setBusy(false);
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="card card-pad form-stack" onSubmit={submit} style={{ maxWidth: 520 }}>
      <h3 style={{ fontSize: 17 }}>Change admin password</h3>
      <div className="field"><label>Current password</label><input className="input" type="password" autoComplete="current-password" value={f.current} onChange={set('current')} required /></div>
      <div className="field"><label>New password (min. 10 characters)</label><input className="input" type="password" autoComplete="new-password" minLength={10} value={f.next} onChange={set('next')} required /></div>
      <div className="field"><label>Repeat new password</label><input className="input" type="password" autoComplete="new-password" value={f.again} onChange={set('again')} required /></div>
      <div><button className="btn btn-gold" disabled={busy}>{busy ? <span className="spinner" /> : 'Update password'}</button></div>
    </form>
  );
}

export default function System() {
  const [tab, setTab] = useState('overview');
  const tabs = [['overview', 'Overview'], ['audit', 'Audit log'], ['email', 'Email log'], ['security', 'Security']];
  const View = useCallback(() => ({ overview: <Overview />, audit: <Audit />, email: <EmailLog />, security: <Security /> }[tab]), [tab]);
  return (
    <>
      <PageHead title="System" sub="Integration health, audit trail, email delivery and security." />
      <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      <View />
    </>
  );
}
