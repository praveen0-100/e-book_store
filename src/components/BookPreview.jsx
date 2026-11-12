import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PREVIEWS } from '../lib/previews.js';
import { CONTENTS } from '../lib/contents.js';
import PAGES from '../lib/preview-pages.json';
import { Icon } from './Icon.jsx';

/** "Look inside": real sample pages from the book, the table of contents and (for a few titles) an intro and illustration. */
export default function BookPreview({ book }) {
  const p = PREVIEWS[book.slug];
  const contents = p?.contents || CONTENTS[book.slug];
  const pages = PAGES[book.slug]; // { total, pages: [page numbers shown] }
  const tabs = [
    pages && ['pages', 'Sample pages'],
    contents && ['contents', 'Contents'],
    p?.intro && ['intro', 'Intro'],
    p?.visual && ['visual', 'Illustration'],
  ].filter(Boolean);
  const [tab, setTab] = useState(tabs[0]?.[0]);
  const [cur, setCur] = useState(0);
  const [zoom, setZoom] = useState(false);
  const count = pages?.pages.length || 0;
  const go = useCallback((d) => setCur((c) => (c + d + count) % count), [count]);

  useEffect(() => {
    if (!zoom) return undefined;
    const key = (e) => { if (e.key === 'Escape') setZoom(false); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    document.body.style.overflow = 'hidden';
    addEventListener('keydown', key);
    return () => { removeEventListener('keydown', key); document.body.style.overflow = ''; };
  }, [zoom, go]);

  if (!tabs.length) return null;
  const src = (i) => `/preview/${book.slug}/page-${i + 1}.jpg`;
  const caption = (i) => `Page ${pages.pages[i]} of ${pages.total}`;

  return (
    <section className="preview card reveal">
      <div className="preview-head">
        <div><span className="eyebrow">Free preview</span><h3>Look inside</h3></div>
        {tab === 'pages' && <span className="muted" style={{ fontSize: 13 }}>{caption(cur)}</span>}
      </div>
      {tabs.length > 1 && (
        <div className="tabs" role="tablist">
          {tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>)}
        </div>
      )}

      {tab === 'pages' && (
        <div className="pv-pages fade-in">
          <div className="pv-stage">
            <button className="pv-nav prev" onClick={() => go(-1)} aria-label="Previous page"><Icon name="arrow" size={18} style={{ transform: 'rotate(180deg)' }} /></button>
            <button className="pv-main" onClick={() => setZoom(true)} aria-label="Enlarge this page">
              <img key={cur} src={src(cur)} alt={`${book.title}, ${caption(cur)}`} loading="lazy" />
              <span className="pv-zoom"><Icon name="search" size={15} /> Enlarge</span>
            </button>
            <button className="pv-nav next" onClick={() => go(1)} aria-label="Next page"><Icon name="arrow" size={18} /></button>
          </div>
          <div className="pv-thumbs">
            {pages.pages.map((n, i) => (
              <button key={n} className={i === cur ? 'on' : ''} onClick={() => setCur(i)} aria-label={`Show ${caption(i)}`}>
                <img src={src(i)} alt="" loading="lazy" /><span>{n}</span>
              </button>
            ))}
          </div>
          <p className="preview-lock" style={{ marginTop: 14 }}><Icon name="lock" size={14} /> {count} of {pages.total} pages shown. The full book has everything.</p>
        </div>
      )}

      <div className="preview-page">
        {tab === 'intro' && p?.intro && (
          <div className="fade-in">
            <span className="eyebrow">{book.title}</span>
            <h4 className="preview-title">{p.intro.title}</h4>
            {p.intro.text.map((t) => <p key={t}>{t}</p>)}
            <p className="preview-lock"><Icon name="lock" size={14} /> The rest of this chapter is in the full book.</p>
          </div>
        )}
        {tab === 'contents' && contents && (
          <ol className="preview-toc fade-in">
            {contents.map(([t, s], n) => <li key={t}><span>{String(n + 1).padStart(2, '0')}</span><div><b>{t}</b><small>{s}</small></div></li>)}
          </ol>
        )}
        {tab === 'visual' && p?.visual && (
          <figure className="fade-in" style={{ margin: 0 }}>
            <img src={`/preview/${book.slug}/visual.png`} alt={p.visual.caption} loading="lazy" style={{ width: '100%', borderRadius: 12, display: 'block' }} />
            <figcaption className="muted" style={{ fontSize: 13, marginTop: 10, textAlign: 'center' }}>{p.visual.caption}</figcaption>
          </figure>
        )}
      </div>

      {zoom && createPortal(
        <div className="pv-lightbox" role="dialog" aria-modal="true" aria-label="Sample page" onClick={() => setZoom(false)}>
          <button className="pv-close icon-btn" onClick={() => setZoom(false)} aria-label="Close"><Icon name="close" size={18} /></button>
          <button className="pv-nav prev" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous page"><Icon name="arrow" size={20} style={{ transform: 'rotate(180deg)' }} /></button>
          <img src={src(cur)} alt={`${book.title}, ${caption(cur)}`} onClick={(e) => e.stopPropagation()} />
          <button className="pv-nav next" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next page"><Icon name="arrow" size={20} /></button>
          <span className="pv-cap">{caption(cur)}</span>
        </div>,
        document.body,
      )}
    </section>
  );
}
