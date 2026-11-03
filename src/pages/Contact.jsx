import { useState } from 'react';
import { api } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import { useConfig } from '../lib/context.jsx';

export default function Contact() {
  const { store_name, support_email } = useConfig();
  const [f, setF] = useState({ name: '', email: '', subject: '', message: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { const r = await api('/feedback', { method: 'POST', body: { ...f, type: 'message' } }); setDone(r.message); } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <div className="container" style={{ maxWidth: 680, paddingBottom: 90 }}>
      <div className="page-head"><span className="eyebrow">Support</span><h1>Contact &amp; feedback</h1><p className="muted">Questions about an order, a download or a book? Send us a message and the {store_name} team will reply by email.</p></div>
      {done ? (
        <div className="card card-pad" style={{ textAlign: 'center', padding: 48 }}>
          <div className="tick" style={{ margin: '0 auto 16px' }}><Icon name="check" size={34} stroke={2.4} /></div>
          <h2 style={{ fontSize: 24, marginBottom: 8 }}>Message sent</h2><p className="muted">{done}</p>
        </div>
      ) : (
        <form className="card card-pad form-stack" onSubmit={submit}>
          {error && <div className="error-box" role="alert">{error}</div>}
          <div className="grid-2">
            <div className="field"><label htmlFor="cn">Your name</label><input id="cn" className="input" required maxLength={80} autoComplete="name" value={f.name} onChange={set('name')} /></div>
            <div className="field"><label htmlFor="ce">Email</label><input id="ce" type="email" className="input" required autoComplete="email" value={f.email} onChange={set('email')} /></div>
          </div>
          <div className="field"><label htmlFor="cs">Subject</label><input id="cs" className="input" maxLength={140} value={f.subject} onChange={set('subject')} placeholder="e.g. Problem downloading my e-book" /></div>
          <div className="field"><label htmlFor="cm">Message</label><textarea id="cm" className="input" required minLength={5} maxLength={3000} style={{ minHeight: 150 }} value={f.message} onChange={set('message')} /></div>
          <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={f.website} onChange={set('website')} />
          <div><button className="btn btn-gold btn-lg" disabled={busy}>{busy ? <span className="spinner" /> : <>Send message <Icon name="arrow" size={18} /></>}</button></div>
          {support_email && <p className="muted" style={{ fontSize: 13 }}>Prefer email? Write to <a href={`mailto:${support_email}`} style={{ textDecoration: 'underline' }}>{support_email}</a>.</p>}
        </form>
      )}
    </div>
  );
}
