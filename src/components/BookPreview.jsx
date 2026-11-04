import { useState } from 'react';
import { PREVIEWS } from '../lib/previews.js';
import { Icon } from './Icon.jsx';

const TABS = [['intro', 'Intro'], ['contents', 'Contents'], ['visual', 'Illustration']];

/** Free 3-page preview: intro, table of contents, one illustration. Hidden for books without preview content. */
export default function BookPreview({ book }) {
  const p = PREVIEWS[book.slug];
  const [tab, setTab] = useState('intro');
  if (!p) return null;
  const i = TABS.findIndex(([k]) => k === tab);
  return (
    <section className="preview card">
      <div className="preview-head">
        <div><span className="eyebrow">Free preview</span><h3>Look inside</h3></div>
        <span className="muted" style={{ fontSize: 13 }}>Page {i + 1} of 3</span>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      <div className="preview-page">
        {tab === 'intro' && (
          <div className="fade-in">
            <span className="eyebrow">{book.title}</span>
            <h4 className="preview-title">{p.intro.title}</h4>
            {p.intro.text.map((t) => <p key={t}>{t}</p>)}
            <p className="preview-lock"><Icon name="lock" size={14} /> The rest of this chapter is in the full book.</p>
          </div>
        )}
        {tab === 'contents' && (
          <ol className="preview-toc fade-in">
            {p.contents.map(([t, s], n) => <li key={t}><span>{String(n + 1).padStart(2, '0')}</span><div><b>{t}</b><small>{s}</small></div></li>)}
          </ol>
        )}
        {tab === 'visual' && (
          <figure className="fade-in" style={{ margin: 0 }}>
            <img src={`/preview/${book.slug}/visual.png`} alt={p.visual.caption} loading="lazy" style={{ width: '100%', borderRadius: 12, display: 'block' }} />
            <figcaption className="muted" style={{ fontSize: 13, marginTop: 10, textAlign: 'center' }}>{p.visual.caption}</figcaption>
          </figure>
        )}
      </div>
    </section>
  );
}
