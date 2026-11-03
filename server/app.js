import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, tx, ready, loadSettings, getSettings, DEFAULT_SETTINGS, slugify, audit, FILES_DIR, COVERS_DIR } from './db.js';
import { COOKIE, makeSession, requireAdmin, verifyPassword, readSession, attachUser } from './auth.js';
import { googleEnabled, googleClientId } from './google.js';
import { mountAuth } from './routes-auth.js';
import { paymentsEnabled, keyId, createOrder, verifyCheckoutSignature, verifyWebhookSignature, fetchPayment } from './payments.js';
import { orderNumber, serializeOrder, fulfil, canDownload, refundOrder } from './orders.js';
import { mountPublic, mountAdmin, dayStartISO, tzMinutes, localDateOf, localDowOf } from './routes-extra.js';
import { securityHeaders, rateLimit, requestLog } from './security.js';
import { blobMode, saveCover, removeFile, sendCover, sendEbook, checkUploadedEbook, EBOOK_EXT, COVER_EXT } from './storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY || process.env.VERCEL) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1); // behind Vercel / nginx: rate limits must see the real client IP
app.use(securityHeaders);
app.use(requestLog);
app.use(express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf; } })); // rawBody is needed to verify webhook signatures
app.use(cookieParser());
app.use(attachUser);

// Every request waits for the database (cold start) and gets fresh-enough settings.
let lastPurge = 0;
app.use(async (req, res, next) => {
  try {
    await ready;
    await loadSettings();
    if (Date.now() - lastPurge > 6 * 3600 * 1000) { // abandoned (never paid) checkouts are cleaned up after 2 days
      lastPurge = Date.now();
      db.prepare("DELETE FROM orders WHERE status = 'pending' AND created_at < ?").run(new Date(Date.now() - 2 * 86400000).toISOString()).catch(() => {});
    }
    next();
  } catch (e) { next(e); }
});

/* Uploads: covers always pass through the server (small). E-books pass through only in local mode;
   on Vercel they go browser -> Blob directly (see /api/admin/blob-upload). */
const upload = multer({
  storage: blobMode
    ? multer.memoryStorage()
    : multer.diskStorage({
      destination: (req, file, cb) => cb(null, file.fieldname === 'cover' ? COVERS_DIR : FILES_DIR),
      filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + path.extname(file.originalname).toLowerCase()),
    }),
  limits: { fileSize: blobMode ? 4 * 1024 * 1024 : 250 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const bad = (m) => cb(Object.assign(new Error(m), { status: 400 }), false);
    if (file.fieldname === 'cover') return COVER_EXT.includes(ext) ? cb(null, true) : bad('Cover must be a JPG, PNG or WebP image.');
    if (blobMode) return bad('E-book files are uploaded directly to storage.');
    return EBOOK_EXT.includes(ext) ? cb(null, true) : bad('E-book must be a PDF, EPUB, MOBI or ZIP file.');
  },
});

/* ------------------------------------------------------------ serializers */
function publicBook(b) {
  return {
    id: b.id, slug: b.slug, title: b.title, subtitle: b.subtitle, author: b.author, description: b.description,
    category: b.category, price_cents: b.price_cents, compare_cents: b.compare_cents, pages: b.pages, format: b.format,
    rating: b.rating, reviews: b.reviews, featured: !!b.featured, published: !!b.published,
    color_a: b.color_a, color_b: b.color_b, has_cover: !!b.cover_file, has_file: !!b.ebook_file, ebook_name: b.ebook_name, created_at: b.created_at,
  };
}
const httpErr = (message, status = 400) => Object.assign(new Error(message), { status });

/* ---------------------------------------------------------------- public */
app.get('/api/config', (req, res) => {
  const s = getSettings();
  res.json({ store_name: s.store_name, currency: s.currency, tax_rate: Number(s.tax_rate), support_email: s.support_email, payments_enabled: paymentsEnabled(), google_client_id: googleEnabled() ? googleClientId() : null, require_login: process.env.REQUIRE_LOGIN_TO_BUY === 'true' });
});

app.get('/api/books', async (req, res) => {
  const { q = '', category = '', sort = 'featured' } = req.query;
  let rows = await db.prepare('SELECT * FROM books WHERE published = 1').all();
  if (q) {
    const t = String(q).toLowerCase();
    rows = rows.filter((b) => `${b.title} ${b.subtitle} ${b.author} ${b.category}`.toLowerCase().includes(t));
  }
  if (category) rows = rows.filter((b) => b.category === category);
  const sorters = {
    featured: (a, b) => b.featured - a.featured || b.reviews - a.reviews,
    newest: (a, b) => b.created_at.localeCompare(a.created_at),
    'price-asc': (a, b) => a.price_cents - b.price_cents,
    'price-desc': (a, b) => b.price_cents - a.price_cents,
    rating: (a, b) => b.rating - a.rating,
    popular: (a, b) => b.reviews - a.reviews,
  };
  rows.sort(sorters[sort] || sorters.featured);
  res.json(rows.map(publicBook));
});

app.get('/api/categories', async (req, res) => {
  res.json(await db.prepare('SELECT category name, COUNT(*) count FROM books WHERE published = 1 GROUP BY category ORDER BY count DESC').all());
});

app.get('/api/books/:slug', async (req, res) => {
  const b = await db.prepare('SELECT * FROM books WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!b) return res.status(404).json({ error: 'Book not found' });
  const related = await db.prepare('SELECT * FROM books WHERE published = 1 AND category = ? AND id != ? LIMIT 4').all(b.category, b.id);
  res.json({ ...publicBook(b), related: related.map(publicBook) });
});

app.get('/api/books/:id/cover', async (req, res) => {
  const b = await db.prepare('SELECT cover_file FROM books WHERE id = ?').get(Number(req.params.id));
  if (!b?.cover_file || !(await sendCover(res, b.cover_file))) return res.status(404).end();
});

async function priceCart(ids, couponCode) {
  const unique = [...new Set(ids.map(Number).filter(Boolean))];
  if (!unique.length) throw httpErr('Your cart is empty.');
  const books = await Promise.all(unique.map((id) => db.prepare('SELECT * FROM books WHERE id = ? AND published = 1').get(id)));
  if (books.some((b) => !b)) throw httpErr('An item in your cart is no longer available.');
  const settings = getSettings();
  const subtotal = books.reduce((a, b) => a + b.price_cents, 0);
  let coupon = null, discount = 0;
  if (couponCode) {
    coupon = await db.prepare('SELECT * FROM coupons WHERE code = ? AND active = 1').get(String(couponCode).trim().toUpperCase());
    if (!coupon) throw httpErr('That promo code is not valid.');
    discount = Math.round((subtotal * coupon.percent) / 100);
  }
  const taxRate = Number(settings.tax_rate) || 0;
  const tax = Math.round(((subtotal - discount) * taxRate) / 100);
  return { books, subtotal, discount, tax, taxRate, total: subtotal - discount + tax, coupon };
}

app.post('/api/cart/quote', async (req, res) => {
  const { ids = [], coupon } = req.body || {};
  const p = await priceCart(ids, coupon);
  res.json({ subtotal_cents: p.subtotal, discount_cents: p.discount, tax_cents: p.tax, total_cents: p.total, tax_rate: p.taxRate, coupon: p.coupon?.code || null, percent: p.coupon?.percent || 0 });
});

/** Step 1: validate the cart, create a Razorpay order and a pending local order. No card data touches this server. */
const checkoutLimiter = rateLimit({ name: 'checkout', windowMs: 10 * 60 * 1000, max: 20, message: 'Too many checkout attempts. Please wait a few minutes and try again.' });
app.post('/api/checkout', checkoutLimiter, async (req, res) => {
  let { ids = [], coupon, name, email } = req.body || {};
  if (process.env.REQUIRE_LOGIN_TO_BUY === 'true' && !req.user) return res.status(401).json({ error: 'Please log in or sign up to continue.' });
  if (req.user) { name = req.user.name; email = req.user.email; } // logged-in customers always buy as their account identity, never a typed-in one
  if (!name?.trim() || name.length > 120) return res.status(400).json({ error: 'Please enter your full name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!paymentsEnabled()) return res.status(503).json({ error: 'Online payments are not configured yet. Please contact the store owner.' });
  const p = await priceCart(ids, coupon); // prices always come from the database, never from the browser
  const settings = getSettings();
  const token = crypto.randomBytes(20).toString('hex');
  const rzp = await createOrder({ amount: p.total, currency: settings.currency, receipt: token.slice(0, 32), notes: { email: email.trim().toLowerCase() } });
  const orderId = await tx(async () => {
    const id = await db.insert(`INSERT INTO orders (token,email,name,status,subtotal_cents,discount_cents,tax_cents,total_cents,tax_rate,coupon,payment_method,provider_order_id,created_at,ip,customer_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, token, email.trim().toLowerCase(), name.trim(), 'pending', p.subtotal, p.discount, p.tax, p.total, p.taxRate, p.coupon?.code || null, 'razorpay', rzp.id, new Date().toISOString(), req.ip || null, req.user?.id || null);
    for (const bk of p.books) await db.prepare('INSERT INTO order_items (order_id,book_id,title,author,price_cents) VALUES (?,?,?,?,?)').run(id, bk.id, bk.title, bk.author, bk.price_cents);
    return id;
  });
  res.json({ token, number: orderNumber(orderId), key_id: keyId(), razorpay_order_id: rzp.id, amount: p.total, currency: settings.currency, store_name: settings.store_name });
});

/** Step 2: the browser reports a finished payment; we verify the signature and re-check it with Razorpay. */
app.post('/api/checkout/verify', checkoutLimiter, async (req, res) => {
  const { token, razorpay_order_id: rOrder, razorpay_payment_id: rPay, razorpay_signature: rSig } = req.body || {};
  const order = await db.prepare('SELECT * FROM orders WHERE token = ? AND provider_order_id = ?').get(String(token || ''), String(rOrder || ''));
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.status !== 'pending') return res.json({ token: order.token }); // already fulfilled (e.g. by the webhook)
  if (!verifyCheckoutSignature({ orderId: rOrder, paymentId: rPay, signature: rSig })) return res.status(400).json({ error: 'Payment verification failed. If money was deducted it will be refunded automatically.' });
  const pay = await fetchPayment(rPay, { amount: order.total_cents, currency: getSettings().currency });
  if (pay.order_id !== order.provider_order_id || pay.amount !== order.total_cents || pay.status !== 'captured') {
    return res.status(402).json({ error: 'The payment was not completed. You have not been charged.' });
  }
  await fulfil(order, pay);
  res.json({ token: order.token });
});

/** Razorpay webhook: fulfils the order even if the customer closed the browser right after paying. */
app.post('/api/webhooks/razorpay', async (req, res) => {
  if (!verifyWebhookSignature(req.rawBody, req.get('x-razorpay-signature'))) return res.status(400).json({ error: 'Invalid signature' });
  const { event, payload } = req.body || {};
  const pay = payload?.payment?.entity;
  if ((event === 'payment.captured' || event === 'order.paid') && pay?.order_id) {
    const order = await db.prepare("SELECT * FROM orders WHERE provider_order_id = ? AND status = 'pending'").get(pay.order_id);
    if (order && pay.status === 'captured' && pay.amount === order.total_cents) await fulfil(order, pay);
  }
  res.json({ ok: true });
});

app.get('/api/orders/:token', async (req, res) => {
  const o = await db.prepare('SELECT * FROM orders WHERE token = ?').get(req.params.token);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  const { token: _t, ...rest } = await serializeOrder(o);
  res.json({ ...rest, token: req.params.token, can_download: canDownload(o), settings: getSettings() });
});

app.get('/api/download/:token/:itemId', async (req, res) => {
  const row = await db.prepare(`SELECT oi.*, o.status, o.approval_status, o.email, o.id order_id FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.token = ? AND oi.id = ?`).get(req.params.token, Number(req.params.itemId));
  if (!row) return res.status(404).send('Download not found');
  if (!canDownload(row)) return res.status(403).send(row.status === 'paid' && row.approval_status === 'pending' ? 'Your payment is awaiting approval. You will be emailed as soon as your downloads are ready.' : 'This order is no longer eligible for download.');
  if (row.downloads >= 10) return res.status(429).send('Download limit reached. Please contact support.');
  const book = row.book_id ? await db.prepare('SELECT * FROM books WHERE id = ?').get(row.book_id) : null;
  const safe = slugify(row.title) || 'ebook';
  if (!book?.ebook_file) return res.status(404).send('This file is currently unavailable. Please contact support.');
  await db.prepare('UPDATE order_items SET downloads = downloads + 1 WHERE id = ?').run(row.id);
  const name = `${safe}${path.extname(book.ebook_name || book.ebook_file) || '.pdf'}`;
  if (!(await sendEbook(res, book.ebook_file, name))) {
    await db.prepare('UPDATE order_items SET downloads = downloads - 1 WHERE id = ?').run(row.id);
    if (!res.headersSent) res.status(404).send('This file is currently unavailable. Please contact support.');
  }
});

/* ----------------------------------------------------------------- admin */
const attempts = new Map();
app.post('/api/admin/login', async (req, res) => {
  const key = req.ip;
  const rec = attempts.get(key) || { n: 0, t: Date.now() };
  if (Date.now() - rec.t > 15 * 60 * 1000) { rec.n = 0; rec.t = Date.now(); }
  if (rec.n >= 10) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  const { email = '', password = '' } = req.body || {};
  const a = await db.prepare('SELECT * FROM admins WHERE email = ?').get(String(email).trim().toLowerCase());
  if (!a || !verifyPassword(String(password), a.password_hash)) {
    rec.n++; attempts.set(key, rec);
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  attempts.delete(key);
  await audit(a.email, 'admin.login', '', req.ip);
  res.cookie(COOKIE, makeSession(a), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 12 * 3600 * 1000 });
  res.json({ id: a.id, email: a.email, name: a.name });
});
app.post('/api/admin/logout', (req, res) => { res.clearCookie(COOKIE); res.json({ ok: true }); });
app.get('/api/admin/me', (req, res) => {
  const s = readSession(req.cookies?.[COOKIE]);
  if (!s) return res.status(401).json({ error: 'Not signed in' });
  res.json({ id: s.id, email: s.email, name: s.name });
});

/** Direct browser -> Vercel Blob upload for e-books (bypasses the 4.5 MB serverless body limit). */
app.post('/api/admin/blob-upload', async (req, res) => {
  if (!blobMode) return res.status(400).json({ error: 'Direct uploads are only used with Vercel Blob storage.' });
  const completed = req.body?.type === 'blob.upload-completed'; // signed callback from Blob itself; verified inside handleUpload
  if (!completed && !readSession(req.cookies?.[COOKIE])) return res.status(401).json({ error: 'Authentication required' });
  const { handleUpload } = await import('@vercel/blob/client');
  const json = await handleUpload({
    body: req.body, request: req,
    onBeforeGenerateToken: async (pathname) => {
      if (!/^ebooks\/[A-Za-z0-9._-]+$/.test(pathname) || !EBOOK_EXT.includes(path.extname(pathname).toLowerCase())) throw httpErr('E-book must be a PDF, EPUB, MOBI or ZIP file.');
      return { maximumSizeInBytes: 500 * 1024 * 1024, addRandomSuffix: true, allowOverwrite: false };
    },
    onUploadCompleted: async () => {},
  });
  res.json(json);
});

const admin = express.Router();
admin.use(requireAdmin);

/* analytics */
admin.get('/analytics', async (req, res) => {
  const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const from = dayStartISO(days - 1), prevFrom = dayStartISO(2 * days - 1), to = dayStartISO(-1);

  const kpi = async (a, b) => {
    const o = await db.prepare(`SELECT COALESCE(SUM(total_cents),0) revenue, COALESCE(SUM(tax_cents),0) tax, COALESCE(SUM(discount_cents),0) discounts, COUNT(*) orders, COUNT(DISTINCT email) customers
      FROM orders WHERE status='paid' AND created_at >= ? AND created_at < ?`).get(a, b);
    const units = (await db.prepare(`SELECT COUNT(*) c FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status='paid' AND o.created_at >= ? AND o.created_at < ?`).get(a, b)).c;
    const rf = await db.prepare(`SELECT COALESCE(SUM(total_cents),0) amount, COUNT(*) n FROM orders WHERE status='refunded' AND created_at >= ? AND created_at < ?`).get(a, b);
    return { revenue: o.revenue, tax: o.tax, discounts: o.discounts, orders: o.orders, customers: o.customers, units, aov: o.orders ? Math.round(o.revenue / o.orders) : 0, refunds: rf.amount, refundCount: rf.n };
  };
  const cur = await kpi(from, to), prev = await kpi(prevFrom, from);

  const rows = await db.prepare(`SELECT ${localDateOf('created_at')} d, SUM(total_cents) revenue, COUNT(*) orders FROM orders
    WHERE status='paid' AND created_at >= ? AND created_at < ? GROUP BY 1`).all(from, to);
  const map = new Map(rows.map((r) => [r.d, r]));
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(new Date(from).getTime() + tzMinutes() * 60000 + i * 86400000).toISOString().slice(0, 10);
    const r = map.get(d);
    return { date: d, revenue: r?.revenue || 0, orders: r?.orders || 0 };
  });

  const topBooks = await db.prepare(`SELECT oi.title, oi.author, MAX(oi.book_id) book_id, COUNT(*) units, SUM(oi.price_cents) sales
    FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status='paid' AND o.created_at >= ? AND o.created_at < ?
    GROUP BY oi.title, oi.author ORDER BY sales DESC LIMIT 6`).all(from, to);
  const categories = await db.prepare(`SELECT COALESCE(b.category,'Other') name, SUM(oi.price_cents) sales, COUNT(*) units
    FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN books b ON b.id=oi.book_id
    WHERE o.status='paid' AND o.created_at >= ? AND o.created_at < ? GROUP BY COALESCE(b.category,'Other') ORDER BY sales DESC`).all(from, to);
  const brands = await db.prepare(`SELECT COALESCE(card_brand,'Card') name, COUNT(*) n, SUM(total_cents) amount FROM orders WHERE status='paid' AND created_at >= ? AND created_at < ? GROUP BY COALESCE(card_brand,'Card') ORDER BY amount DESC`).all(from, to);
  const weekdays = await db.prepare(`SELECT ${localDowOf('created_at')} dow, SUM(total_cents) revenue FROM orders WHERE status='paid' AND created_at >= ? AND created_at < ? GROUP BY 1`).all(from, to);
  const recentRows = await db.prepare("SELECT * FROM orders WHERE status != 'pending' ORDER BY created_at DESC LIMIT 8").all();
  const recent = await Promise.all(recentRows.map(async (o) => ({ ...(await serializeOrder(o)), items: undefined, item_count: (await db.prepare('SELECT COUNT(*) c FROM order_items WHERE order_id=?').get(o.id)).c })));
  const lifetime = await db.prepare(`SELECT COALESCE(SUM(total_cents),0) revenue, COUNT(*) orders FROM orders WHERE status='paid'`).get();
  const totals = { books: (await db.prepare('SELECT COUNT(*) c FROM books').get()).c, lifetimeRevenue: lifetime.revenue, lifetimeOrders: lifetime.orders };
  res.json({ days, cur, prev, series, topBooks, categories, brands, weekdays, recent, totals });
});

/* books */
const bookFields = (b) => {
  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    title: String(b.title || '').trim(), subtitle: String(b.subtitle || '').trim(), author: String(b.author || '').trim(),
    description: String(b.description || '').trim(), category: String(b.category || 'General').trim() || 'General',
    price_cents: Math.round(num(b.price) * 100), compare_cents: Math.round(num(b.compare_price) * 100),
    pages: Math.round(num(b.pages)), format: String(b.format || 'PDF').trim(),
    featured: b.featured === 'true' || b.featured === true ? 1 : 0, published: b.published === 'false' || b.published === false ? 0 : 1,
    color_a: /^#[0-9a-f]{6}$/i.test(b.color_a) ? b.color_a : '#1c1c2b', color_b: /^#[0-9a-f]{6}$/i.test(b.color_b) ? b.color_b : '#d4af6a',
  };
};
const uploadFields = upload.fields([{ name: 'cover', maxCount: 1 }, { name: 'ebook', maxCount: 1 }]);
const NEEDS_FILE = 'Upload the e-book file (PDF/EPUB) before publishing, or save it as a draft by unticking "Published".';

/** The e-book for this request: a multipart file (local mode) or a blob the browser already uploaded (Vercel). */
async function incomingEbook(req) {
  const file = req.files?.ebook?.[0];
  if (file) return { key: file.filename, name: file.originalname };
  if (blobMode && req.body.ebook_blob) {
    if (!(await checkUploadedEbook(req.body.ebook_blob))) throw httpErr('The uploaded e-book could not be found. Please upload it again.');
    return { key: `blob:${req.body.ebook_blob}`, name: String(req.body.ebook_name || path.basename(req.body.ebook_blob)).slice(0, 200) };
  }
  return null;
}

admin.get('/storage', (req, res) => res.json({ mode: blobMode ? 'blob' : 'local' }));

admin.get('/books', async (req, res) => {
  const rows = await db.prepare(`SELECT b.*, (SELECT COUNT(*) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.book_id=b.id AND o.status='paid') sold,
    (SELECT COALESCE(SUM(oi.price_cents),0) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.book_id=b.id AND o.status='paid') sales FROM books b ORDER BY b.created_at DESC`).all();
  res.json(rows.map((b) => ({ ...publicBook(b), sold: b.sold, sales: b.sales })));
});

admin.post('/books', uploadFields, async (req, res) => {
  const f = bookFields(req.body);
  if (!f.title || !f.author || f.price_cents <= 0) return res.status(400).json({ error: 'Title, author and a price greater than zero are required.' });
  const ebook = await incomingEbook(req);
  if (f.published && !ebook) return res.status(400).json({ error: NEEDS_FILE });
  let slug = slugify(f.title) || 'book', n = 1;
  while (await db.prepare('SELECT 1 FROM books WHERE slug = ?').get(slug)) slug = `${slugify(f.title) || 'book'}-${++n}`;
  const cover = req.files?.cover?.[0];
  const coverKey = cover ? await saveCover(cover) : null;
  const id = await db.insert(`INSERT INTO books (slug,title,subtitle,author,description,category,price_cents,compare_cents,pages,format,featured,published,color_a,color_b,cover_file,ebook_file,ebook_name,created_at,rating,reviews)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0)`, slug, f.title, f.subtitle, f.author, f.description, f.category, f.price_cents, f.compare_cents, f.pages, f.format, f.featured, f.published, f.color_a, f.color_b, coverKey, ebook?.key || null, ebook?.name || null, new Date().toISOString());
  await audit(req.admin.email, 'book.created', f.title);
  res.json(publicBook(await db.prepare('SELECT * FROM books WHERE id = ?').get(id)));
});

admin.put('/books/:id', uploadFields, async (req, res) => {
  const id = Number(req.params.id);
  const old = await db.prepare('SELECT * FROM books WHERE id = ?').get(id);
  if (!old) return res.status(404).json({ error: 'Book not found' });
  const f = bookFields(req.body);
  if (!f.title || !f.author || f.price_cents <= 0) return res.status(400).json({ error: 'Title, author and a price greater than zero are required.' });
  const ebook = await incomingEbook(req);
  if (f.published && !ebook && !old.ebook_file) return res.status(400).json({ error: NEEDS_FILE });
  const cover = req.files?.cover?.[0];
  let coverFile = old.cover_file;
  if (req.body.remove_cover === 'true') { await removeFile('cover', old.cover_file); coverFile = null; }
  if (cover) { await removeFile('cover', old.cover_file); coverFile = await saveCover(cover); }
  if (ebook) await removeFile('ebook', old.ebook_file);
  await db.prepare(`UPDATE books SET title=?,subtitle=?,author=?,description=?,category=?,price_cents=?,compare_cents=?,pages=?,format=?,featured=?,published=?,color_a=?,color_b=?,cover_file=?,ebook_file=?,ebook_name=? WHERE id=?`)
    .run(f.title, f.subtitle, f.author, f.description, f.category, f.price_cents, f.compare_cents, f.pages, f.format, f.featured, f.published, f.color_a, f.color_b, coverFile, ebook ? ebook.key : old.ebook_file, ebook ? ebook.name : old.ebook_name, id);
  await audit(req.admin.email, 'book.updated', f.title);
  res.json(publicBook(await db.prepare('SELECT * FROM books WHERE id = ?').get(id)));
});

admin.delete('/books/:id', async (req, res) => {
  const b = await db.prepare('SELECT * FROM books WHERE id = ?').get(Number(req.params.id));
  if (!b) return res.status(404).json({ error: 'Book not found' });
  await removeFile('cover', b.cover_file); await removeFile('ebook', b.ebook_file);
  await db.prepare('UPDATE order_items SET book_id = NULL WHERE book_id = ?').run(b.id);
  await db.prepare('DELETE FROM books WHERE id = ?').run(b.id);
  await audit(req.admin.email, 'book.deleted', b.title);
  res.json({ ok: true });
});

/* orders */
admin.get('/orders', async (req, res) => {
  const { q = '', status = '', approval = '', page = 1, limit = 15 } = req.query;
  const where = ["status != 'pending'"], params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  if (approval === 'pending') where.push("(approval_status = 'pending' OR (approval_status = 'approved' AND invoice_status = 'pending' AND status = 'paid'))");
  if (q) {
    const num = String(q).toUpperCase().replace('ORD-', '');
    where.push('(email ILIKE ? OR name ILIKE ? OR payment_ref ILIKE ? OR invoice_no ILIKE ? OR id = ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, Number(num) - 1000 || -1);
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = (await db.prepare(`SELECT COUNT(*) c FROM orders ${w}`).get(...params)).c;
  const lim = Math.min(Number(limit) || 15, 100), off = (Math.max(Number(page), 1) - 1) * lim;
  const rows = await db.prepare(`SELECT o.*, (SELECT COUNT(*) FROM order_items WHERE order_id=o.id) item_count FROM orders o ${w} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, lim, off);
  res.json({ total, page: Number(page), pages: Math.ceil(total / lim), rows: rows.map(({ ip: _ip, ...o }) => ({ ...o, number: orderNumber(o.id) })) });
});

admin.get('/orders.csv', async (req, res) => {
  const rows = await db.prepare("SELECT * FROM orders WHERE status != 'pending' ORDER BY created_at DESC").all();
  const q = (v) => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; }; // quotes + blocks spreadsheet formula injection
  const csv = ['Order,Invoice No,Date,Customer,Email,Status,Approval,Subtotal,Discount,Tax,Total,Coupon,Payment,Payment Ref']
    .concat(rows.map((o) => [orderNumber(o.id), o.invoice_no || '', o.created_at, q(o.name), q(o.email), o.status, o.approval_status, (o.subtotal_cents / 100).toFixed(2), (o.discount_cents / 100).toFixed(2), (o.tax_cents / 100).toFixed(2), (o.total_cents / 100).toFixed(2), o.coupon || '', `${o.card_brand || ''} ${o.card_last4 || ''}`.trim(), o.payment_ref].join(','))).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
  res.send(csv);
});

admin.get('/orders/:id', async (req, res) => {
  const o = await db.prepare("SELECT * FROM orders WHERE id = ? AND status != 'pending'").get(Number(req.params.id));
  if (!o) return res.status(404).json({ error: 'Order not found' });
  res.json({ ...(await serializeOrder(o)), settings: getSettings() });
});

admin.post('/orders/:id/refund', async (req, res) => {
  res.json(await serializeOrder(await refundOrder(Number(req.params.id), req.admin.email)));
});

/* coupons */
admin.get('/coupons', async (req, res) => res.json(await db.prepare('SELECT * FROM coupons ORDER BY id DESC').all()));
admin.post('/coupons', async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const percent = Math.round(Number(req.body.percent));
  if (code.length < 3 || !(percent >= 1 && percent <= 90)) return res.status(400).json({ error: 'Enter a code (3+ characters) and a discount between 1 and 90%.' });
  if (await db.prepare('SELECT 1 FROM coupons WHERE code = ?').get(code)) return res.status(400).json({ error: 'That code already exists.' });
  await db.prepare('INSERT INTO coupons (code, percent) VALUES (?,?)').run(code, percent);
  await audit(req.admin.email, 'coupon.created', code, `${percent}%`);
  res.json({ ok: true });
});
admin.put('/coupons/:id', async (req, res) => { await db.prepare('UPDATE coupons SET active = ? WHERE id = ?').run(req.body.active ? 1 : 0, Number(req.params.id)); res.json({ ok: true }); });
admin.delete('/coupons/:id', async (req, res) => { await db.prepare('DELETE FROM coupons WHERE id = ?').run(Number(req.params.id)); res.json({ ok: true }); });

/* settings */
const publicSettings = () => Object.fromEntries(Object.entries(getSettings()).filter(([k]) => k in DEFAULT_SETTINGS));
admin.get('/settings', (req, res) => res.json(publicSettings()));
admin.put('/settings', async (req, res) => {
  const tax = Number(req.body.tax_rate);
  if (!(tax >= 0 && tax <= 50)) return res.status(400).json({ error: 'Tax rate must be between 0 and 50.' });
  if (req.body.currency !== undefined) { req.body.currency = String(req.body.currency).toUpperCase(); if (!/^[A-Z]{3}$/.test(req.body.currency)) return res.status(400).json({ error: 'Currency must be a 3-letter ISO code, e.g. INR.' }); }
  const off = Number(req.body.tz_offset_minutes ?? getSettings().tz_offset_minutes);
  if (!(off >= -720 && off <= 840)) return res.status(400).json({ error: 'Invalid timezone offset.' });
  await tx(async () => {
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (req.body[k] !== undefined) await db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(k, String(req.body[k]).slice(0, 2000));
    }
  });
  await loadSettings(true);
  await audit(req.admin.email, 'settings.updated');
  res.json(publicSettings());
});

mountAuth(app);
mountPublic(app);
mountAdmin(admin);
app.use('/api/admin', admin);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

/* local / Docker: serve the built client (on Vercel the CDN serves it) */
const dist = path.join(__dirname, '..', 'dist');
if (!process.env.VERCEL && fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h' }));
  app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(dist, 'index.html')) : next()));
}

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is too large.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

export default app;
