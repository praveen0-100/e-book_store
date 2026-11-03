/** Typographic cover art, rendered purely in CSS so every title looks premium
 *  even before a cover image is uploaded. Scales with its container (cqw units). */
export default function BookCover({ book, className = '', style }) {
  const a = book.color_b || '#d4af6a';
  const b = book.color_a || '#1c1c2b';
  const vars = { '--a': a, '--g': `linear-gradient(150deg, ${b} 0%, ${b} 55%, #05050a 140%)`, ...style };
  if (book.has_cover) {
    return (
      <div className={`cover ${className}`} style={vars}>
        <img className="cover-img" src={`/api/books/${book.id}/cover`} alt={`${book.title} cover`} loading="lazy" />
      </div>
    );
  }
  return (
    <div className={`cover ${className}`} style={vars} role="img" aria-label={`${book.title} by ${book.author}`}>
      <div className="cover-art">
        <div>
          <div className="cover-cat">{book.category}</div>
          <div className="cover-title">{book.title}</div>
          <div className="cover-rule" />
          {book.subtitle && <div className="cover-sub">{book.subtitle}</div>}
        </div>
        <div className="cover-author">{book.author}</div>
      </div>
    </div>
  );
}
