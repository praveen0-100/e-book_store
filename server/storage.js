import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { FILES_DIR, COVERS_DIR } from './db.js';

/**
 * File storage for covers and e-books.
 *   - Vercel / production:  Vercel Blob (private store)   when BLOB_READ_WRITE_TOKEN is set.
 *       e-books are uploaded straight from the admin's browser to Blob (serverless functions cap request bodies at 4.5 MB)
 *       and streamed to paying customers through the download route, which checks payment + download limits first.
 *   - Local dev / Docker:   files on disk in DATA_DIR/files and DATA_DIR/covers.
 * A stored key is either a plain filename (local) or "blob:<pathname>" (Vercel Blob).
 */
export const blobMode = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
export const EBOOK_EXT = ['.pdf', '.epub', '.mobi', '.zip', '.docx'];
export const COVER_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const COVER_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const isBlob = (key) => String(key || '').startsWith('blob:');
const blobPath = (key) => key.slice(5);
const blobSdk = () => import('@vercel/blob');

/** Saves an uploaded cover (multer file) and returns its storage key. */
export async function saveCover(file) {
  if (!blobMode) return file.filename; // multer already wrote it to COVERS_DIR
  const ext = path.extname(file.originalname).toLowerCase();
  const { put } = await blobSdk();
  const r = await put(`covers/${crypto.randomBytes(10).toString('hex')}${ext}`, file.buffer, { access: 'private', contentType: COVER_TYPES[ext] || 'application/octet-stream', addRandomSuffix: false });
  return `blob:${r.pathname}`;
}

export async function removeFile(kind, key) {
  if (!key) return;
  try {
    if (isBlob(key)) { const { del } = await blobSdk(); await del(blobPath(key)); }
    else fs.rmSync(path.join(kind === 'cover' ? COVERS_DIR : FILES_DIR, key), { force: true });
  } catch (e) { console.error('Could not remove stored file', key, e.message); }
}

async function pipeBlob(res, key, headers) {
  const { get } = await blobSdk();
  const r = await get(blobPath(key), { access: 'private' });
  if (!r || r.statusCode !== 200 || !r.stream) return false;
  for (const [k, v] of Object.entries({ 'Content-Type': r.blob.contentType || 'application/octet-stream', ...(r.blob.size ? { 'Content-Length': String(r.blob.size) } : {}), ...headers })) res.setHeader(k, v);
  await new Promise((resolve, reject) => { const s = Readable.fromWeb(r.stream); s.on('error', reject); res.on('close', resolve); s.pipe(res); });
  return true;
}

/** Sends the cover image. Returns false when the file is missing. */
export async function sendCover(res, key) {
  const cache = { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' };
  if (isBlob(key)) return pipeBlob(res, key, cache);
  const file = path.join(COVERS_DIR, key);
  if (!fs.existsSync(file)) return false;
  res.setHeader('Cache-Control', cache['Cache-Control']);
  res.sendFile(file);
  return true;
}

/** Sends the e-book as a download. Returns false when the file is missing. */
export async function sendEbook(res, key, downloadName) {
  const headers = { 'Content-Disposition': `attachment; filename="${downloadName}"`, 'Cache-Control': 'private, no-store' };
  if (isBlob(key)) return pipeBlob(res, key, headers);
  const file = path.join(FILES_DIR, key);
  if (!fs.existsSync(file)) return false;
  res.download(file, downloadName);
  return true;
}

/** Validates a blob pathname the admin's browser reports after a direct upload, and confirms it really exists. */
export async function checkUploadedEbook(pathname) {
  if (!/^ebooks\/[A-Za-z0-9._-]+$/.test(pathname || '') || !EBOOK_EXT.includes(path.extname(pathname).toLowerCase())) return false;
  try { const { head } = await blobSdk(); await head(pathname, { access: 'private' }); return true; } catch { return false; }
}
