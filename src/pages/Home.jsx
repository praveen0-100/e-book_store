import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import BookCard, { BookGridSkeleton } from '../components/BookCard.jsx';
import BookCover from '../components/BookCover.jsx';
import { CountUp } from '../lib/motion.jsx';

const TRUST = [['bolt', 'Instant delivery', 'Download the moment you pay'], ['shield', 'Secure checkout', 'UPI, cards & net banking'], ['infinity', 'Lifetime access', 'Re-download any time'], ['headset', 'Real support', 'Humans, within a day']];
const STEPS = [['Choose', 'Browse the library and add the titles you love to your cart.'], ['Pay securely', 'Check out as a guest with UPI, card or net banking. No account needed.'], ['Download', 'Get your files and a professional tax invoice instantly. Yours forever.']];

function Head({ eyebrow, title, to, cta }) {
  return (
    <div className="section-head reveal">
      <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>
      {to && <Link to={to} className="btn btn-ghost btn-sm">{cta} <Icon name="arrow" size={16} /></Link>}
    </div>
  );
}

export default function Home() {
  const [books, setBooks] = useState(null);
  const [cats, setCats] = useState([]);
  const stage = useRef(null);
  useEffect(() => {
    api('/books').then(setBooks).catch(() => setBooks([]));
    api('/categories').then(setCats).catch(() => {});
  }, []);

  // soft parallax: the hero books drift toward the pointer
  const onMove = (e) => {
    const el = stage.current; if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    el.style.setProperty('--my', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  };
  const onLeave = () => { stage.current?.style.setProperty('--mx', 0); stage.current?.style.setProperty('--my', 0); };

  const featured = books?.filter((b) => b.featured) ?? [];
  const newest = books ? [...books].sort((a, b) => b.created_at.localeCompare(a.created_at)) : [];
  const best = books ? [...books].slice(0, 4) : [];
  const fresh = newest.slice(0, 4);
  const heroBooks = [...newest.filter((b) => b.has_cover), ...newest.filter((b) => !b.has_cover)].slice(0, 3);
  const minPrice = books?.some((b) => b.price_cents > 0) ? Math.min(...books.map((b) => b.price_cents).filter((c) => c > 0), Infinity) : 0;

  return (
    <>
      <section className="hero">
        <div className="hero-bg" aria-hidden="true"><i className="blob b1" /><i className="blob b2" /><i className="grid-lines" /></div>
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="pill hero-pill"><i className="live-dot" /> Instant PDF downloads · Lifetime access</span>
            <h1 className="hero-title">
              <span className="w" style={{ '--i': 0 }}>Learn smarter.</span>{' '}
              <span className="w gold-text" style={{ '--i': 1 }}>Start sooner.</span>{' '}
              <span className="w" style={{ '--i': 2 }}>Grow further.</span>
            </h1>
            <p className="lead hero-lead">Handpicked e-books for your career, coding and communication{minPrice ? <> — starting at <b>{money(minPrice)}</b></> : null}. Buy once, download instantly, keep forever.</p>
            <div className="hero-cta">
              <Link to="/books" className="btn btn-gold btn-lg shine">Explore the library <Icon name="arrow" size={18} /></Link>
              <Link to="/books?sort=newest" className="btn btn-ghost btn-lg">New releases</Link>
            </div>
            <div className="hero-stats">
              <div><b>{books ? <CountUp to={books.length} suffix="+" /> : '—'}</b><span>E-books</span></div>
              <div><b>{cats.length ? <CountUp to={cats.length} /> : '—'}</b><span>Topics</span></div>
              <div><b>24/7</b><span>Instant access</span></div>
            </div>
          </div>
          <div className="hero-stage" ref={stage} onMouseMove={onMove} onMouseLeave={onLeave}>
            <div className="hero-glow" />
            {heroBooks.map((b, i) => (
              <Link key={b.id} to={`/books/${b.slug}`} className={`hb c${i + 1}`} aria-label={b.title}>
                <BookCover book={b} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="trust">
        <div className="container trust-inner">
          {TRUST.map(([ic, t, s], i) => (
            <div className="trust-item reveal" style={{ '--d': `${i * 80}ms` }} key={t}><span className="ico"><Icon name={ic} size={20} /></span><div><b>{t}</b><span>{s}</span></div></div>
          ))}
        </div>
      </div>

      <section className="section">
        <div className="container">
          <Head eyebrow="Editor’s picks" title="Featured this month" to="/books" cta="View all" />
          {books ? <div className="grid-books">{(featured.length ? featured : books).slice(0, 4).map((b) => <BookCard key={b.id} book={b} />)}</div> : <BookGridSkeleton n={4} />}
        </div>
      </section>

      {cats.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <Head eyebrow="Browse by topic" title="Find your next read" />
            <div className="cats">
              {cats.map((c, i) => (
                <Link key={c.name} className="cat-tile reveal" style={{ '--d': `${i * 60}ms` }} to={`/books?category=${encodeURIComponent(c.name)}`}>
                  <b>{c.name}</b><span>{c.count} {c.count === 1 ? 'title' : 'titles'}</span>
                  <Icon name="arrow" size={18} className="go" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <Head eyebrow="Reader favourites" title="Bestsellers" to="/books?sort=popular" cta="See more" />
          {books ? <div className="grid-books">{best.map((b) => <BookCard key={b.id} book={b} />)}</div> : <BookGridSkeleton n={4} />}
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <Head eyebrow="Just landed" title="New releases" to="/books?sort=newest" cta="See all" />
          {books ? <div className="grid-books">{fresh.map((b) => <BookCard key={b.id} book={b} />)}</div> : <BookGridSkeleton n={4} />}
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <Head eyebrow="How it works" title="From checkout to chapter one in a minute" />
          <div className="steps">
            {STEPS.map(([t, d], i) => (
              <div className="card step reveal" style={{ '--d': `${i * 110}ms` }} key={t}><div className="n">0{i + 1}</div><h3>{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 40 }}>
        <div className="cta-band reveal">
          <span className="eyebrow">Start reading today</span>
          <h2 style={{ marginTop: 12 }}>Your next favourite book is one click away.</h2>
          <p className="muted" style={{ marginBottom: 28 }}>Pay securely, download instantly, and keep your books forever.</p>
          <Link to="/books" className="btn btn-gold btn-lg shine">Explore the library <Icon name="arrow" size={18} /></Link>
        </div>
      </section>
    </>
  );
}
