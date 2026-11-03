import { useEffect, useState } from 'react';
import { api, fmtDate } from '../lib/api.js';
import { Icon } from './Icon.jsx';
import { useAuth } from '../lib/context.jsx';
import GoogleSignIn from './GoogleSignIn.jsx';

function StarPick({ value, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="star-pick" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button type="button" key={n} role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={(hover || value) >= n ? 'on' : ''} onMouseEnter={() => setHover(n)} onClick={() => onChange(n)}>
          <Icon name="star" size={26} fill="currentColor" stroke={0} />
        </button>
      ))}
    </div>
  );
}

export default function Reviews({ book }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [f, setF] = useState({ name: '', email: '', rating: 0, message: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api(`/books/${book.slug}/reviews`).then(setData).catch(() => setData({ reviews: [], distribution: [0, 0, 0, 0, 0] })); }, [book.slug]);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { const r = await api('/feedback', { method: 'POST', body: { ...f, type: 'review', book_id: book.id } }); setMsg(r.message); } catch (err) { setError(err.message); }
    setBusy(false);
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const total = data ? data.distribution.reduce((a, b) => a + b, 0) : 0;

  return (
    <section style={{ padding: '56px 0 20px' }} aria-labelledby="reviews-h">
      <div className="section-head"><div><span className="eyebrow">Readers say</span><h2 id="reviews-h">Reviews</h2></div></div>
      <div className="detail" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)', gap: 40, alignItems: 'start' }}>
        <div>
          {data && total > 0 && (
            <div className="dist" style={{ marginBottom: 24 }}>
              {[5, 4, 3, 2, 1].map((n) => (
                <div key={n}><span>{n}★</span><span className="bar"><i style={{ width: `${(data.distribution[n - 1] / total) * 100}%` }} /></span><span>{data.distribution[n - 1]}</span></div>
              ))}
            </div>
          )}
          {!data && <div className="skeleton" style={{ height: 120 }} />}
          {data?.reviews.map((r) => (
            <article className="review" key={r.id}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="stars">{'★'.repeat(r.rating)}<span style={{ opacity: 0.25 }}>{'★'.repeat(5 - r.rating)}</span></span>
                <b style={{ fontSize: 14 }}>{r.name}</b>
                {r.verified ? <span className="badge green">Verified purchase</span> : null}
                <span className="muted" style={{ fontSize: 12.5, marginLeft: 'auto' }}>{fmtDate(r.created_at)}</span>
              </div>
              <p style={{ fontSize: 14.5, whiteSpace: 'pre-wrap' }}>{r.message}</p>
              {r.reply && <div className="reply"><small className="muted">Reply from the publisher</small><br />{r.reply}</div>}
            </article>
          ))}
          {data && !data.reviews.length && <p className="muted">No reviews yet. Be the first to share your thoughts.</p>}
        </div>

        <div className="card card-pad">
          {msg ? (
            <div style={{ textAlign: 'center', padding: '24px 8px' }}><div className="tick" style={{ margin: '0 auto 12px' }}><Icon name="check" size={30} stroke={2.4} /></div><b>{msg}</b></div>
          ) : (
            <form className="form-stack" onSubmit={submit}>
              <h3 style={{ fontSize: 20 }}>Write a review</h3>
              {error && <div className="error-box" role="alert">{error}</div>}
              <StarPick value={f.rating} onChange={(n) => setF({ ...f, rating: n })} />
              {user
                ? <p className="muted" style={{ fontSize: 13.5 }}>Reviewing as <b style={{ color: 'var(--text)' }}>{user.name}</b>. Your email is never shown.</p>
                : <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><GoogleSignIn size="medium" text="continue_with" /><span className="muted" style={{ fontSize: 13 }}>or fill in the form</span></div>}
              {!user && <div className="grid-2">
                <div className="field"><label htmlFor="rn">Name</label><input id="rn" className="input" required maxLength={80} value={f.name} onChange={set('name')} autoComplete="name" /></div>
                <div className="field"><label htmlFor="re">Email (never shown)</label><input id="re" type="email" className="input" required value={f.email} onChange={set('email')} autoComplete="email" /></div>
              </div>}
              <div className="field"><label htmlFor="rm">Your review</label><textarea id="rm" className="input" required minLength={5} maxLength={3000} value={f.message} onChange={set('message')} /></div>
              <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={f.website} onChange={set('website')} />
              <div><button className="btn btn-gold" disabled={busy || !f.rating}>{busy ? <span className="spinner" /> : 'Submit review'}</button></div>
              <p className="muted" style={{ fontSize: 12.5 }}>Reviews are checked before they appear. Use the email you bought with to get a “Verified purchase” badge.</p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
