import { Link } from 'react-router-dom';
import BookCover from './BookCover.jsx';
import { Icon } from './Icon.jsx';
import { money, priceText } from '../lib/api.js';
import { useCart, useToast } from '../lib/context.jsx';

export function Stars({ rating, reviews }) {
  if (reviews === 0) return <span className="muted" style={{ fontSize: 13 }}>No reviews yet</span>;
  return (
    <span className="stars"><Icon name="star" size={14} fill="currentColor" stroke={0} /> {rating.toFixed(1)}{reviews != null && <small>({reviews.toLocaleString()})</small>}</span>
  );
}

export default function BookCard({ book }) {
  const cart = useCart();
  const toast = useToast();
  const inCart = cart.has(book.id);
  const onSale = book.compare_cents > book.price_cents;
  const add = (e) => {
    e.preventDefault();
    if (inCart) return;
    cart.add(book);
    toast(`“${book.title}” added to cart`);
  };
  return (
    <Link to={`/books/${book.slug}`} className="book-card reveal">
      <div className="cover-wrap">
        {onSale && <span className="badge gold sale-tag">−{Math.round((1 - book.price_cents / book.compare_cents) * 100)}%</span>}
        <BookCover book={book} />
      </div>
      <div className="book-info">
        <span className="book-cat">{book.category}</span>
        <h3>{book.title}</h3>
        <div className="author">{book.author}</div>
        <div className="row">
          <div>
            <div className="price"><span className={book.price_cents === 0 ? 'free-price' : ''}>{priceText(book.price_cents)}</span>{onSale && <s>{money(book.compare_cents)}</s>}</div>
          </div>
          <button className={`add-btn ${inCart ? 'in' : ''}`} onClick={add} aria-label={inCart ? 'In cart' : `Add ${book.title} to cart`}>
            <Icon name={inCart ? 'check' : 'plus'} size={17} />
          </button>
        </div>
      </div>
    </Link>
  );
}

export function BookGridSkeleton({ n = 8 }) {
  return (
    <div className="grid-books">
      {Array.from({ length: n }, (_, i) => (
        <div key={i}><div className="skeleton" style={{ aspectRatio: '2/3' }} /><div className="skeleton" style={{ height: 18, marginTop: 14, width: '80%' }} /><div className="skeleton" style={{ height: 14, marginTop: 8, width: '50%' }} /></div>
      ))}
    </div>
  );
}
