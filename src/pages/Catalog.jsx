import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import BookCard, { BookGridSkeleton } from '../components/BookCard.jsx';
import { Icon } from '../components/Icon.jsx';

export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const sort = params.get('sort') || 'featured';
  const [books, setBooks] = useState(null);
  const [cats, setCats] = useState([]);

  useEffect(() => { api('/categories').then(setCats).catch(() => {}); }, []);
  useEffect(() => {
    setBooks(null);
    const qs = new URLSearchParams({ q, category, sort }).toString();
    api(`/books?${qs}`).then(setBooks).catch(() => setBooks([]));
  }, [q, category, sort]);

  const set = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  return (
    <div className="container">
      <div className="page-head">
        <span className="eyebrow">The library</span>
        <h1>{q ? <>Results for “{q}”</> : category || 'All books'}</h1>
      </div>
      <div className="toolbar sticky-bar">
        <div className="chips">
          <button className={`chip ${!category ? 'active' : ''}`} onClick={() => set('category', '')}>All</button>
          {cats.map((c) => <button key={c.name} className={`chip ${category === c.name ? 'active' : ''}`} onClick={() => set('category', c.name)}>{c.name}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="nav-search" style={{ display: 'flex', minWidth: 200 }}>
            <Icon name="search" size={16} />
            <input value={q} onChange={(e) => set('q', e.target.value)} placeholder="Filter…" aria-label="Filter books" />
          </div>
          <select className="input" style={{ width: 'auto' }} value={sort} onChange={(e) => set('sort', e.target.value)} aria-label="Sort books">
            <option value="featured">Featured</option>
            <option value="popular">Most popular</option>
            <option value="newest">Newest</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </div>
      </div>
      {books === null ? <BookGridSkeleton /> : books.length ? (
        <>
          <p className="result-count">{books.length} {books.length === 1 ? 'book' : 'books'}</p>
          <div className="grid-books" style={{ paddingBottom: 80 }}>{books.map((b) => <BookCard key={b.id} book={b} />)}</div>
        </>
      ) : (
        <div className="empty"><Icon name="search" size={40} /><h2>No books found</h2><p>Try a different search or category.</p></div>
      )}
    </div>
  );
}
