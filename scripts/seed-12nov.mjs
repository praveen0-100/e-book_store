/**
 * Adds the e-books in src/e-books/12nov (The First Job: First 90 Days, Rs 50; The Power of Communication, Rs 50; by PrepPath Store).
 *   npx vercel env pull .env.prod --environment production
 *   node --env-file=.env.prod scripts/seed-12nov.mjs      (delete .env.prod afterwards)
 * Safe to re-run: a book whose title already exists is updated, not duplicated.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { put } from '@vercel/blob';

if (!process.env.DATABASE_URL && process.env.POSTGRES_URL) process.env.DATABASE_URL = process.env.POSTGRES_URL;
const { db, ready, slugify } = await import('../server/db.js');
await ready;

const DIR = 'src/e-books/12nov';
const BOOKS = [
  { cover: 'First-Job-Cover.png', file: 'First-Job-First-90-Days.pdf', title: 'The First Job: First 90 Days', subtitle: 'Your Guide to Succeeding in the First 90 Days', category: 'Career', rupees: 50, color_a: '#0b1d33', color_b: '#4fc3f7' },
  { cover: 'Communication-Cover.png', file: 'Power-of-Communication.pdf', title: 'The Power of Communication', subtitle: 'Speak, Listen and Connect with Confidence', category: 'Career', rupees: 50, color_a: '#3b1d5a', color_b: '#f4a261' },
];
const upload = async (folder, file, contentType) => {
  const ext = path.extname(file).toLowerCase();
  const r = await put(`${folder}/${crypto.randomBytes(10).toString('hex')}${ext}`, fs.readFileSync(path.join(DIR, file)), { access: 'private', contentType, addRandomSuffix: false });
  return `blob:${r.pathname}`;
};

for (const b of BOOKS) {
  const price = b.rupees * 100;
  const cover = await upload('covers', b.cover, 'image/png');
  const ebook = await upload('ebooks', b.file, 'application/pdf');
  const old = await db.prepare('SELECT id FROM books WHERE title = ?').get(b.title);
  if (old) {
    await db.prepare('UPDATE books SET author=?, price_cents=?, compare_cents=0, subtitle=?, cover_file=?, ebook_file=?, ebook_name=?, format=?, published=1 WHERE id=?').run('PrepPath Store', price,b.subtitle, cover, ebook, b.file, 'PDF', old.id);
  } else {
    await db.insert(`INSERT INTO books (slug,title,subtitle,author,description,category,price_cents,compare_cents,pages,format,featured,published,color_a,color_b,cover_file,ebook_file,ebook_name,created_at,rating,reviews)
      VALUES (?,?,?,?,?,?,?,0,0,'PDF',1,1,?,?,?,?,?,?,0,0)`, slugify(b.title), b.title, b.subtitle, 'PrepPath Store', '', b.category, price, b.color_a, b.color_b, cover, ebook, b.file, new Date().toISOString());
  }
  console.log('✓', b.title, '- Rs', b.rupees);
}
process.exit(0);
