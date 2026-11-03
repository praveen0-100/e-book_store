import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import BookCover from '../components/BookCover.jsx';
import BookCard, { BookGridSkeleton } from '../components/BookCard.jsx';
import { useConfig } from '../lib/context.jsx';

export default function Home() {
  const { store_name } = useConfig();
  const [books, setBooks] = useState(null);
  const [cats, setCats] = useState([]);
  useEffect(() => {
    api('/books').then(setBooks).catch(() => setBooks([]));
    api('/categories').then(setCats).catch(() => {});
  }, []);

  const featured = books?.filter((b) => b.featured) ?? [];
  const hero = featured.slice(0, 3);
  const best = books ? [...books].sort((a, b) => b.reviews - a.reviews).slice(0, 4) : [];
  const fresh = books ? [...books].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 4) : [];

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="fade-in">
            <span className="eyebrow">E-books published by PrepPath</span>
            <h1>Ideas worth <span className="gold-text">keeping.</span></h1>
            <p className="lead">{store_name} publishes e-books to help you prepare, learn and grow. Pay once, download instantly, read on any device — forever.</p>
            <div className="hero-cta">
              <Link to="/books" className="btn btn-gold btn-lg">Browse the library <Icon name="arrow" size={18} /></Link>
              <Link to="/books?sort=popular" className="btn btn-ghost btn-lg">Bestsellers</Link>
            </div>
            <div className="hero-stats">
              <div><b>{books ? books.length : '—'}</b><span>Titles</span></div>
              <div><b>{cats.length || '—'}</b><span>Topics</span></div>
              <div><b>PDF</b><span>Instant download</span></div>
            </div>
          </div>
          <div className="hero-stage" aria-hidden="true">
            <div className="hero-glow" />
            {hero.map((b, i) => <BookCover key={b.id} book={b} className={`c${i + 1}`} />)}
          </div>
        </div>
      </section>

      <div className="trust">
        <div className="container trust-inner">
          {[['bolt', 'Instant delivery', 'Download the moment you pay'], ['shield', 'Secure checkout', 'UPI, cards & net banking'], ['infinity', 'Lifetime access', 'Re-download any time'], ['headset', 'Real support', 'Humans, within a day']].map(([ic, t, s]) => (
            <div className="trust-item" key={t}><span className="ico"><Icon name={ic} size={20} /></span><div><b>{t}</b><span>{s}</span></div></div>
          ))}
        </div>
      </div>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div><span className="eyebrow">Editor’s picks</span><h2>Featured this month</h2></div>
            <Link to="/books" className="btn btn-ghost btn-sm">View all <Icon name="arrow" size={16} /></Link>
          </div>
          {books ? <div className="grid-books">{(featured.length ? featured : books).slice(0, 4).map((b) => <BookCard key={b.id} book={b} />)}</div> : <BookGridSkeleton n={4} />}
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-head"><div><span className="eyebrow">Browse by topic</span><h2>Find your next read</h2></div></div>
          <div className="cats">
            {cats.map((c) => (
              <Link key={c.name} className="cat-tile" to={`/books?category=${encodeURIComponent(c.name)}`}>
                <b>{c.name}</b><span>{c.count} {c.count === 1 ? 'title' : 'titles'}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-head"><div><span className="eyebrow">Reader favourites</span><h2>Bestsellers</h2></div><Link to="/books?sort=popular" className="btn btn-ghost btn-sm">See more <Icon name="arrow" size={16} /></Link></div>
          {books ? <div className="grid-books">{best.map((b) => <BookCard key={b.id} book={b} />)}</div> : <BookGridSkeleton n={4} />}
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-head"><div><span className="eyebrow">Just landed</span><h2>New releases</h2></div></div>
          {books ? <div className="grid-books">{fresh.map((b) => <BookCard key={b.id} book={b} />)}</div> : <BookGridSkeleton n={4} />}
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-head"><div><span className="eyebrow">How it works</span><h2>From checkout to chapter one in a minute</h2></div></div>
          <div className="steps">
            {[['Choose', 'Browse the library and add the titles you love to your cart.'], ['Pay securely', 'Check out as a guest with UPI, card or net banking. No account needed.'], ['Download', 'Get your files and a professional tax invoice instantly. Yours forever.']].map(([t, d], i) => (
              <div className="card step" key={t}><div className="n">0{i + 1}</div><h3>{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 40 }}>
        <div className="cta-band">
          <span className="eyebrow">Start reading today</span>
          <h2 style={{ marginTop: 12 }}>Your next favourite book is one click away.</h2>
          <p className="muted" style={{ marginBottom: 28 }}>Pay securely, download instantly, and keep your books forever.</p>
          <Link to="/books" className="btn btn-gold btn-lg">Explore the library <Icon name="arrow" size={18} /></Link>
        </div>
      </section>
    </>
  );
}
