import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import { useConfig } from '../lib/context.jsx';
import { InstallApp, useAdminApp } from '../lib/pwa.jsx';

export default function Login() {
  const { store_name } = useConfig();
  const nav = useNavigate();
  useAdminApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api('/admin/login', { method: 'POST', body: { email, password } });
      nav('/admin', { replace: true });
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <div className="login-art">
        <Link to="/" className="logo"><span className="logo-mark"><Icon name="book" size={19} stroke={2.2} /></span>{store_name}</Link>
        <div>
          <span className="eyebrow">Publisher console</span>
          <h2 style={{ margin: '14px 0 18px' }}>Every sale, every invoice, <span className="gold-text">in one place.</span></h2>
          <p className="muted" style={{ maxWidth: 440 }}>Track revenue in real time, manage your catalogue, issue refunds and download tax-ready invoices.</p>
        </div>
        <div className="muted" style={{ fontSize: 13 }}>Protected area · all sign-ins are rate limited</div>
      </div>
      <div className="login-form">
        <form className="login-card" onSubmit={submit}>
          <div>
            <h1 style={{ fontSize: 34 }}>Welcome back</h1>
            <p className="muted" style={{ marginTop: 6 }}>Sign in to your admin account.</p>
          </div>
          {error && <div className="error-box" role="alert">{error}</div>}
          <div className="field"><label htmlFor="e">Email</label><input id="e" className="input" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="field"><label htmlFor="p">Password</label><input id="p" className="input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></div>
          <button className="btn btn-gold btn-lg btn-block" disabled={busy}>{busy ? <span className="spinner" /> : <>Sign in <Icon name="arrow" size={18} /></>}</button>
          <InstallApp className="btn btn-ghost btn-block" label="Install admin app on this device" />
          <Link to="/" className="muted" style={{ textAlign: 'center', fontSize: 13 }}>← Back to storefront</Link>
        </form>
      </div>
    </div>
  );
}
