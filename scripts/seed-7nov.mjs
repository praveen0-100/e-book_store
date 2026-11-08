/**
 * Adds the e-books in src/e-books/7nov (AI Handbook Rs 50, Money Made Simple Rs 30, Beyond the Ordinary Rs 60).
 *   npx vercel env pull .env.prod --environment production
 *   node --env-file=.env.prod scripts/seed-7nov.mjs      (delete .env.prod afterwards)
 * Safe to re-run: a book whose title already exists is updated, not duplicated.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { put } from '@vercel/blob';

if (!process.env.DATABASE_URL && process.env.POSTGRES_URL) process.env.DATABASE_URL = process.env.POSTGRES_URL;
const { db, ready, slugify } = await import('../server/db.js');
await ready;

const DIR = 'src/e-books/7nov';
const BOOKS = [
  { cover: 'AI-Handbook-Ebook-Cover.png', file: 'The-AI-for-Everyone-Practical-AI-Handbook-DK-Edition.docx', title: 'The AI-for-Everyone Practical AI Handbook', subtitle: 'DK Edition', category: 'Technology', rupees: 50, color_a: '#0f1a2e', color_b: '#5cc8ff' },
  { cover: 'Money-Made-Simple-Ebook-Cover.png', file: 'Money-Made-Simple-Financial-Literacy-Guide.docx', title: 'Money Made Simple: Financial Literacy Guide', subtitle: '', category: 'Finance', rupees: 30, color_a: '#12262a', color_b: '#5cd6a0' },
  { cover: 'Beyond-the-Ordinary-Ebook-Cover.png', file: 'Beyond-the-Ordinary-Short-Stories.docx', title: 'Beyond the Ordinary: Short Stories', subtitle: '', category: 'Fiction', rupees: 60, color_a: '#1c1c2b', color_b: '#d4af6a' },
];
const upload = async (folder, file, contentType) => {
  const ext = path.extname(file).toLowerCase();
  const r = await put(`${folder}/${crypto.randomBytes(10).toString('hex')}${ext}`, fs.readFileSync(path.join(DIR, file)), { access: 'private', contentType, addRandomSuffix: false });
  return `blob:${r.pathname}`;
};

for (const b of BOOKS) {
  const price = b.rupees * 100;
  const cover = await upload('covers', b.cover, 'image/png');
  const ebook = await upload('ebooks', b.file, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const old = await db.prepare('SELECT id FROM books WHERE title = ?').get(b.title);
  if (old) {
    await db.prepare('UPDATE books SET price_cents=?, compare_cents=0, subtitle=?, cover_file=?, ebook_file=?, ebook_name=?, format=?, published=1 WHERE id=?').run(price, b.subtitle, cover, ebook, b.file, 'DOCX', old.id);
  } else {
    await db.insert(`INSERT INTO books (slug,title,subtitle,author,description,category,price_cents,compare_cents,pages,format,featured,published,color_a,color_b,cover_file,ebook_file,ebook_name,created_at,rating,reviews)
      VALUES (?,?,?,?,?,?,?,0,0,'DOCX',1,1,?,?,?,?,?,?,0,0)`, slugify(b.title), b.title, b.subtitle, 'PrepPath', '', b.category, price, b.color_a, b.color_b, cover, ebook, b.file, new Date().toISOString());
  }
  console.log('✓', b.title, '- Rs', b.rupees);
}
process.exit(0);
