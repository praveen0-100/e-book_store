import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import GoogleSignIn from '../components/GoogleSignIn.jsx';
import { useAuth, useConfig, useToast } from '../lib/context.jsx';

/** Only allow same-site relative redirects after login (blocks open-redirect tricks like //evil.com). */
const safeNext = (n) => (typeof n === 'string' && /^\/(?!\/)/.test(n) ? n : '/account');

function Shell({ title, sub, children, foot }) {
  return (
    <div className="container" style={{ maxWidth: 460, padding: '56px 0 100px' }}>
      <div className="card card-pad form-stack" style={{ gap: 18 }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 30 }}>{title}</h1>
          {sub && <p className="muted" style={{ marginTop: 6, fontSize: 14.5 }}>{sub}</p>}
        </div>
        {children}
      </div>
      {foot && <p className="muted" style={{ textAlign: 'center', marginTop: 18, fontSize: 14 }}>{foot}</p>}
    </div>
  );
}

function PasswordField({ id, label = 'Password', value, onChange, autoComplete, hint }) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input id={id} className="input" type={show ? 'text' : 'password'} required minLength={autoComplete === 'new-password' ? 8 : 1} maxLength={128} autoComplete={autoComplete} value={value} onChange={onChange} style={{ paddingRight: 70 }} />
        <button type="button" onClick={() => setShow(!show)} className="muted" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12.5, fontWeight: 600 }} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
      </div>
      {hint && <small className="muted" style={{ fontSize: 12.5 }}>{hint}</small>}
    </div>
  );
}

function OrDivider() {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--faint)', fontSize: 12.5 }}><span style={{ flex: 1, height: 1, background: 'var(--line)' }} />or<span style={{ flex: 1, height: 1, background: 'var(--line)' }} /></div>;
}

/** The Google button with an 'or' divider on the correct side; renders nothing when Google sign-in is not configured. */
function GoogleBlock({ text, onDone, dividerAfter = true }) {
  const { google_client_id } = useConfig();
  if (!google_client_id) return null;
  const btn = <div style={{ display: 'flex', justifyContent: 'center' }}><GoogleSignIn text={text} onDone={onDone} /></div>;
  return dividerAfter ? <>{btn}<OrDivider /></> : <><OrDivider />{btn}</>;
}

/* ------------------------------------------------------------------ Log in */
export function Login() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const { login } = useAuth();
  const [f, setF] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await login(f.email, f.password); nav(next, { replace: true }); } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Shell title="Log in" sub="Welcome back. Log in to see your orders and re-download your e-books."
      foot={<>New here? <Link to={`/signup${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} style={{ color: 'var(--gold)', textDecoration: 'underline' }}>Create an account</Link></>}>
      <GoogleBlock text="signin_with" onDone={() => nav(next, { replace: true })} />
      <form className="form-stack" onSubmit={submit}>
        {error && <div className="error-box" role="alert">{error}</div>}
        <div className="field"><label htmlFor="le">Email</label><input id="le" type="email" className="input" required autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <PasswordField id="lp" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />
        <div style={{ textAlign: 'right', marginTop: -8 }}><Link to="/forgot" className="muted" style={{ fontSize: 13, textDecoration: 'underline' }}>Forgot password?</Link></div>
        <button className="btn btn-gold btn-lg btn-block" disabled={busy}>{busy ? <span className="spinner" /> : <>Log in <Icon name="arrow" size={18} /></>}</button>
      </form>
    </Shell>
  );
}

/* ----------------------------------------------------------------- Sign up */
export function Signup() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const { register } = useAuth();
  const [f, setF] = useState({ name: '', email: '', password: '', agree: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { const r = await register(f.name, f.email, f.password); setDone(r); } catch (err) { setError(err.message); setBusy(false); }
  };
  if (done) {
    return (
      <Shell title="You’re in!" sub={`Welcome, ${done.user.name.split(' ')[0]}.`}>
        <div className="ok-box">{done.verification_email
          ? <>We sent a confirmation link to <b>{done.user.email}</b>. Click it to verify your address.</>
          : <>Your account is ready. Email confirmation isn’t available right now, so order history will list purchases made while you are logged in.</>}</div>
        <button className="btn btn-gold btn-lg btn-block" onClick={() => nav(next, { replace: true })}>Continue <Icon name="arrow" size={18} /></button>
      </Shell>
    );
  }
  return (
    <Shell title="Create your account" sub="Sign up to keep your e-books in one place and check out faster."
      foot={<>Already have an account? <Link to={`/login${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} style={{ color: 'var(--gold)', textDecoration: 'underline' }}>Log in</Link></>}>
      <form className="form-stack" onSubmit={submit}>
        {error && <div className="error-box" role="alert">{error}</div>}
        <div className="field"><label htmlFor="sn">Full name</label><input id="sn" className="input" required minLength={2} maxLength={80} autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="se">Email</label><input id="se" type="email" className="input" required autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <PasswordField id="sp" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" hint="At least 8 characters." />
        <label className="check" style={{ alignItems: 'flex-start' }}>
          <input type="checkbox" required checked={f.agree} onChange={(e) => setF({ ...f, agree: e.target.checked })} style={{ marginTop: 4 }} />
          <span className="muted" style={{ fontSize: 13 }}>I agree that my details are stored to manage my account and orders.</span>
        </label>
        <button className="btn btn-gold btn-lg btn-block" disabled={busy}>{busy ? <span className="spinner" /> : <>Sign up <Icon name="arrow" size={18} /></>}</button>
      </form>
      <GoogleBlock text="signup_with" dividerAfter={false} onDone={() => nav(next, { replace: true })} />
    </Shell>
  );
}

/* ---------------------------------------------------------- Forgot / Reset */
export function Forgot() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('/auth/forgot', { method: 'POST', body: { email } }); setSent(true); } catch (err) { setError(err.message); }
    setBusy(false);
  };
  return (
    <Shell title="Reset your password" sub="Enter your email and we’ll send you a link to choose a new one." foot={<Link to="/login" style={{ textDecoration: 'underline' }}>← Back to log in</Link>}>
      {sent
        ? <div className="ok-box">If an account exists for <b>{email}</b>, a reset link is on its way. It is valid for one hour.</div>
        : <form className="form-stack" onSubmit={submit}>
            {error && <div className="error-box" role="alert">{error}</div>}
            <div className="field"><label htmlFor="fe">Email</label><input id="fe" type="email" className="input" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <button className="btn btn-gold btn-lg btn-block" disabled={busy}>{busy ? <span className="spinner" /> : 'Send reset link'}</button>
          </form>}
    </Shell>
  );
}

export function Reset() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { setUser } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { const r = await api('/auth/reset', { method: 'POST', body: { token: params.get('token'), password } }); setUser(r.user); nav('/account', { replace: true }); } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Shell title="Choose a new password">
      <form className="form-stack" onSubmit={submit}>
        {error && <div className="error-box" role="alert">{error} <Link to="/forgot" style={{ textDecoration: 'underline' }}>Request a new link</Link></div>}
        <PasswordField id="np" label="New password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" hint="At least 8 characters." />
        <button className="btn btn-gold btn-lg btn-block" disabled={busy}>{busy ? <span className="spinner" /> : 'Save password & log in'}</button>
      </form>
    </Shell>
  );
}

/* ------------------------------------------------------------ Verify email */
export function Verify() {
  const [params] = useSearchParams();
  const { setUser } = useAuth();
  const [state, setState] = useState({ status: 'working', error: '' });
  const ran = useRef(false);
  const toast = useToast();
  useEffect(() => {
    if (ran.current) return; ran.current = true; // links are single-use: never call twice (React strict mode)
    api('/auth/verify', { method: 'POST', body: { token: params.get('token') } })
      .then((r) => { setUser(r.user); setState({ status: 'ok' }); toast('Email confirmed'); })
      .catch((e) => setState({ status: 'error', error: e.message }));
  }, []); // eslint-disable-line
  return (
    <Shell title={state.status === 'ok' ? 'Email confirmed' : state.status === 'error' ? 'Link not valid' : 'Confirming…'}>
      {state.status === 'working' && <div style={{ textAlign: 'center' }}><span className="spinner" /></div>}
      {state.status === 'ok' && <><div className="ok-box">Thanks. Your email is confirmed and all your orders now appear in your account.</div><Link to="/account" className="btn btn-gold btn-lg btn-block">Go to my account</Link></>}
      {state.status === 'error' && <><div className="error-box" role="alert">{state.error}</div><Link to="/login" className="btn btn-ghost btn-block">Log in</Link></>}
    </Shell>
  );
}
