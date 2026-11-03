import { useEffect, useState } from 'react';
import { api, money } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import BookCover from '../components/BookCover.jsx';
import { useToast } from '../lib/context.jsx';
import { PageHead } from './AdminLayout.jsx';

const CATEGORIES = ['Business', 'Technology', 'Design', 'Finance', 'Fiction', 'Self-Growth', 'Science', 'History'];
const EMPTY = { title: '', subtitle: '', author: '', category: 'Business', price: '', compare_price: '', pages: '', format: 'PDF · EPUB', description: '', color_a: '#141a33', color_b: '#d4af6a', featured: false, published: true };

function BookForm({ book, onClose, onSaved }) {
  const toast = useToast();
  const editing = !!book?.id;
  const [f, setF] = useState(editing ? { ...EMPTY, ...book, price: (book.price_cents / 100).toString(), compare_price: book.compare_cents ? (book.compare_cents / 100).toString() : '', pages: book.pages || '' } : EMPTY);
  const [cover, setCover] = useState(null);
  const [ebook, setEbook] = useState(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  useEffect(() => {
    if (!cover) { setPreview(null); return; }
    const u = URL.createObjectURL(cover);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [cover]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const fd = new FormData();
    ['title', 'subtitle', 'author', 'category', 'price', 'compare_price', 'pages', 'format', 'description', 'color_a', 'color_b'].forEach((k) => fd.append(k, f[k] ?? ''));
    fd.append('featured', f.featured); fd.append('published', f.published);
    if (cover) fd.append('cover', cover);
    if (ebook) fd.append('ebook', ebook);
    if (removeCover) fd.append('remove_cover', 'true');
    try {
      await api(editing ? `/admin/books/${book.id}` : '/admin/books', { method: editing ? 'PUT' : 'POST', form: fd });
      toast(editing ? 'Book updated' : 'Book created');
      onSaved();
    } catch (err) { setError(err.message); setBusy(false); }
  };

  const previewBook = { ...f, id: book?.id, has_cover: !!preview || (editing && book.has_cover && !removeCover), category: f.category || 'Category', title: f.title || 'Book title', author: f.author || 'Author name' };

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit}>
        <div className="modal-head"><h3>{editing ? 'Edit book' : 'Add a new book'}</h3><button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={17} /></button></div>
        <div className="modal-body">
          <div className="form-stack" style={{ alignContent: 'start' }}>
            {preview ? <div className="cover"><img className="cover-img" src={preview} alt="" /></div> : <BookCover book={previewBook} />}
            <div className="upload"><span className="label">Cover image (optional)</span>
              <input type="file" accept="image/*" onChange={(e) => { setCover(e.target.files[0] || null); setRemoveCover(false); }} />
              {editing && book.has_cover && !cover && <label className="check"><input type="checkbox" checked={removeCover} onChange={(e) => setRemoveCover(e.target.checked)} /> Remove current image</label>}
            </div>
            {!preview && !previewBook.has_cover && <div className="grid-2"><div className="field"><label>Base</label><input type="color" className="input" style={{ padding: 4, height: 40 }} value={f.color_a} onChange={set('color_a')} /></div><div className="field"><label>Accent</label><input type="color" className="input" style={{ padding: 4, height: 40 }} value={f.color_b} onChange={set('color_b')} /></div></div>}
          </div>
          <div className="form-stack">
            {error && <div className="error-box" role="alert">{error}</div>}
            <div className="field"><label>Title *</label><input className="input" required value={f.title} onChange={set('title')} /></div>
            <div className="field"><label>Subtitle</label><input className="input" value={f.subtitle} onChange={set('subtitle')} /></div>
            <div className="grid-2">
              <div className="field"><label>Author *</label><input className="input" required value={f.author} onChange={set('author')} /></div>
              <div className="field"><label>Category</label><input className="input" list="cats" value={f.category} onChange={set('category')} /><datalist id="cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist></div>
            </div>
            <div className="grid-3">
              <div className="field"><label>Price (USD) *</label><input className="input" type="number" min="0.5" step="0.01" required value={f.price} onChange={set('price')} /></div>
              <div className="field"><label>Original price</label><input className="input" type="number" min="0" step="0.01" value={f.compare_price} onChange={set('compare_price')} placeholder="optional" /></div>
              <div className="field"><label>Pages</label><input className="input" type="number" min="0" value={f.pages} onChange={set('pages')} /></div>
            </div>
            <div className="field"><label>Description</label><textarea className="input" value={f.description} onChange={set('description')} /></div>
            <div className="upload"><span className="label">Ebook file (PDF / EPUB / MOBI) — delivered to buyers</span>
              <input type="file" accept=".pdf,.epub,.mobi,.zip" onChange={(e) => setEbook(e.target.files[0] || null)} />
              <span>{ebook ? `Selected: ${ebook.name}` : editing && book.has_file ? `Current file: ${book.ebook_name}` : 'No file yet — upload your PDF/EPUB. A book can only be published once it has a file.'}</span>
            </div>
            <div style={{ display: 'flex', gap: 28 }}>
              <label className="check"><input type="checkbox" checked={f.featured} onChange={set('featured')} /> Featured on homepage</label>
              <label className="check"><input type="checkbox" checked={f.published} onChange={set('published')} /> Published</label>
            </div>
          </div>
        </div>
        <div className="modal-foot"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-gold" disabled={busy}>{busy ? <span className="spinner" /> : editing ? 'Save changes' : 'Create book'}</button></div>
      </form>
    </div>
  );
}

export default function Books() {
  const toast = useToast();
  const [books, setBooks] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} (new) | book
  const [q, setQ] = useState('');
  const [del, setDel] = useState(null);

  const load = () => api('/admin/books').then(setBooks).catch((e) => toast(e.message, 'err'));
  useEffect(() => { load(); }, []); // eslint-disable-line

  const remove = async () => {
    try { await api(`/admin/books/${del.id}`, { method: 'DELETE' }); toast('Book deleted'); setDel(null); load(); } catch (e) { toast(e.message, 'err'); }
  };
  const shown = books?.filter((b) => `${b.title} ${b.author} ${b.category}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHead title="Books" sub="Manage your catalogue, pricing and downloadable files.">
        <button className="btn btn-gold" onClick={() => setEditing({})}><Icon name="plus" size={17} /> Add book</button>
      </PageHead>
      <div className="filters"><input className="input" placeholder="Search books…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search books" /></div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Book</th><th>Category</th><th className="num">Price</th><th className="num">Sold</th><th className="num">Sales</th><th>File</th><th>Status</th><th /></tr></thead>
            <tbody>
              {!shown && Array.from({ length: 5 }, (_, i) => <tr key={i}><td colSpan={8}><div className="skeleton" style={{ height: 40 }} /></td></tr>)}
              {shown?.map((b) => (
                <tr key={b.id}>
                  <td><div className="cell-book"><BookCover book={b} /><div><b>{b.title}</b><small>{b.author}</small></div></div></td>
                  <td className="muted">{b.category}</td>
                  <td className="num">{money(b.price_cents)}</td>
                  <td className="num">{b.sold}</td>
                  <td className="num"><b>{money(b.sales)}</b></td>
                  <td>{b.has_file ? <span className="badge green">Uploaded</span> : <span className="badge red">No file</span>}</td>
                  <td>{b.published ? <span className="badge green">Live</span> : <span className="badge red">Draft</span>}{b.featured && <span className="badge gold" style={{ marginLeft: 6 }}>★</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="icon-btn" style={{ display: 'inline-grid' }} onClick={() => setEditing(b)} aria-label={`Edit ${b.title}`}><Icon name="edit" size={16} /></button>{' '}
                    <button className="icon-btn" style={{ display: 'inline-grid' }} onClick={() => setDel(b)} aria-label={`Delete ${b.title}`}><Icon name="trash" size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {editing && <BookForm book={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {del && (
        <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setDel(null)}>
          <div className="modal" style={{ width: 460 }}>
            <div className="modal-head"><h3>Delete “{del.title}”?</h3></div>
            <div style={{ padding: 28 }} className="muted">This removes the book and its files from the store. Past orders and invoices are kept.</div>
            <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setDel(null)}>Cancel</button><button className="btn btn-danger" onClick={remove}>Delete book</button></div>
          </div>
        </div>
      )}
    </>
  );
}
