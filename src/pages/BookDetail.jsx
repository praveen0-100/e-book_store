import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, money } from '../lib/api.js';
import BookCover from '../components/BookCover.jsx';
import BookCard from '../components/BookCard.jsx';
import { Icon } from '../components/Icon.jsx';
import { useCart, useToast } from '../lib/context.jsx';
import NotFound from './NotFound.jsx';
import BookPreview from '../components/BookPreview.jsx';

export default function BookDetail() {
  const { slug } = useParams();
  const [book, setBook] = useState(null);
  const [missing, setMissing] = useState(false);
  const cart = useCart();
  const toast = useToast();
  const nav = useNavigate();

  useEffect(() => {
    setBook(null); setMissing(false);
    api(`/books/${slug}`).then((b) => { setBook(b); document.title = `${b.title} — ${b.author}`; }).catch(() => setMissing(true));
  }, [slug]);

  if (missing) return <NotFound />;
  if (!book) return <div className="container detail"><div className="skeleton" style={{ aspectRatio: '2/3' }} /><div><div className="skeleton" style={{ height: 50, width: '70%' }} /><div className="skeleton" style={{ height: 200, marginTop: 30 }} /></div></div>;

  const inCart = cart.has(book.id);
  const onSale = book.compare_cents > book.price_cents;
  const add = () => { cart.add(book); toast(`“${book.title}” added to cart`); };

  return (
    <div className="container">
      <div className="detail fade-in">
        <div className="cover-big"><BookCover book={book} /></div>
        <div>
          <Link to={`/books?category=${encodeURIComponent(book.category)}`} className="eyebrow">{book.category}</Link>
          <h1>{book.title}</h1>
          {book.subtitle && <p className="subtitle">{book.subtitle}</p>}
          <p style={{ margin: '14px 0' }} className="muted">by <b style={{ color: 'var(--text)' }}>{book.author}</b></p>

          <div className="card buy-box">
            <div className="big-price">{money(book.price_cents)}{onSale && <s>{money(book.compare_cents)}</s>}</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {inCart
                ? <Link to="/cart" className="btn btn-gold btn-lg"><Icon name="check" size={18} /> In cart — view cart</Link>
                : <button className="btn btn-gold btn-lg" onClick={add}><Icon name="bag" size={18} /> Add to cart</button>}
              <button className="btn btn-ghost btn-lg" onClick={() => { if (!inCart) cart.add(book); nav('/checkout'); }}>Buy now</button>
            </div>
            <ul className="perks">
              <li><Icon name="bolt" size={18} /> Instant download after purchase</li>
              <li><Icon name="infinity" size={18} /> Lifetime access · re-download any time</li>
              <li><Icon name="receipt" size={18} /> Tax invoice included</li>
            </ul>
          </div>

          <div className="specs">
            <div><small>Format</small><b>{book.format}</b></div>
            <div><small>Pages</small><b>{book.pages || '—'}</b></div>
            <div><small>Category</small><b>{book.category}</b></div>
            <div><small>Published</small><b>{new Date(book.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</b></div>
          </div>

          <h3 style={{ margin: '36px 0 12px', fontSize: 24 }}>About this book</h3>
          <p className="prose">{book.description || 'No description provided.'}</p>
        </div>
      </div>

      <BookPreview book={book} />

      {book.related?.length > 0 && (
        <section style={{ padding: '40px 0 80px' }}>
          <div className="section-head"><div><span className="eyebrow">Keep reading</span><h2>You may also like</h2></div></div>
          <div className="grid-books">{book.related.map((b) => <BookCard key={b.id} book={b} />)}</div>
        </section>
      )}
    </div>
  );
}
