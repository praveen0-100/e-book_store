/**
 * Adds the e-books in src/e-books to the store at Rs 10.00 each (covers + .docx files -> Vercel Blob, rows -> Postgres).
 *
 *   vercel env pull .env.prod --environment production     (creates a local file with your production keys)
 *   node --env-file=.env.prod scripts/seed-ebooks.mjs
 *   (delete .env.prod afterwards; .env* is git-ignored)
 *
 * Safe to re-run: a book whose title already exists is updated instead of duplicated.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { put } from '@vercel/blob';

if (!process.env.DATABASE_URL && process.env.POSTGRES_URL) process.env.DATABASE_URL = process.env.POSTGRES_URL;
const { db, ready, slugify } = await import('../server/db.js');
await ready;

const DIR = 'src/e-books';
const PRICE_CENTS = 1000; // Rs 10.00
const BOOKS = [
  { base: 'Prompt-Smart', title: 'Prompt Smart', subtitle: 'DK Edition', category: 'Technology', color_a: '#1c1c2b', color_b: '#d4af6a' },
  { base: 'Quantum-Computing-Decoded', title: 'Quantum Computing Decoded', subtitle: 'DK Edition', category: 'Technology', color_a: '#0f1a2e', color_b: '#5cc8ff' },
];
const upload = async (folder, file, contentType) => {
  const ext = path.extname(file).toLowerCase();
  const r = await put(`${folder}/${crypto.randomBytes(10).toString('hex')}${ext}`, fs.readFileSync(path.join(DIR, file)), { access: 'private', contentType, addRandomSuffix: false });
  return `blob:${r.pathname}`;
};

for (const b of BOOKS) {
  const cover = await upload('covers', `${b.base}-Cover.jpg`, 'image/jpeg');
  const ebook = await upload('ebooks', `${b.base}-DK-Edition.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const name = `${b.base}-DK-Edition.docx`;
  const old = await db.prepare('SELECT id FROM books WHERE title = ?').get(b.title);
  if (old) {
    await db.prepare('UPDATE books SET price_cents=?, compare_cents=0, subtitle=?, cover_file=?, ebook_file=?, ebook_name=?, format=?, published=1 WHERE id=?').run(PRICE_CENTS, b.subtitle, cover, ebook, name, 'DOCX', old.id);
  } else {
    await db.insert(`INSERT INTO books (slug,title,subtitle,author,description,category,price_cents,compare_cents,pages,format,featured,published,color_a,color_b,cover_file,ebook_file,ebook_name,created_at,rating,reviews)
      VALUES (?,?,?,?,?,?,?,0,0,'DOCX',1,1,?,?,?,?,?,?,0,0)`, slugify(b.title), b.title, b.subtitle, 'PrepPath', '', b.category, PRICE_CENTS, b.color_a, b.color_b, cover, ebook, name, new Date().toISOString());
  }
  console.log('✓', b.title, '- Rs 10.00');
}
process.exit(0);
