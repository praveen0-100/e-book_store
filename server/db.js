import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
export const FILES_DIR = path.join(DATA_DIR, 'files');
export const COVERS_DIR = path.join(DATA_DIR, 'covers');
for (const d of [DATA_DIR, FILES_DIR, COVERS_DIR]) fs.mkdirSync(d, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'store.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT DEFAULT '',
  author TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  compare_cents INTEGER DEFAULT 0,
  pages INTEGER DEFAULT 0,
  format TEXT DEFAULT 'PDF · EPUB',
  rating REAL DEFAULT 4.7,
  reviews INTEGER DEFAULT 0,
  featured INTEGER DEFAULT 0,
  published INTEGER DEFAULT 1,
  color_a TEXT DEFAULT '#1c1c2b',
  color_b TEXT DEFAULT '#d4af6a',
  cover_file TEXT,
  ebook_file TEXT,
  ebook_name TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid',
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  tax_rate REAL NOT NULL DEFAULT 0,
  coupon TEXT,
  payment_method TEXT DEFAULT 'razorpay',
  card_brand TEXT,
  card_last4 TEXT,
  payment_ref TEXT,
  created_at TEXT NOT NULL,
  refunded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  book_id INTEGER,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  downloads INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  percent INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  uses INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`);

// Lightweight migration: link orders to the payment provider's order id
const orderCols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
if (!orderCols.includes('provider_order_id')) db.exec('ALTER TABLE orders ADD COLUMN provider_order_id TEXT');
const addCol = (table, col, ddl) => {
  if (!db.prepare('PRAGMA table_info(' + table + ')').all().some((c) => c.name === col)) db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + col + ' ' + ddl);
};
addCol('orders', 'approval_status', "TEXT NOT NULL DEFAULT 'approved'"); // approved | pending | rejected  (payment approval)
addCol('orders', 'approved_at', 'TEXT');
addCol('orders', 'approved_by', 'TEXT');
addCol('orders', 'reject_reason', 'TEXT');
addCol('orders', 'invoice_status', "TEXT NOT NULL DEFAULT 'issued'"); // pending | issued | void  (invoice approval)
addCol('orders', 'invoice_no', 'TEXT');
addCol('orders', 'invoice_issued_at', 'TEXT');
addCol('orders', 'invoice_issued_by', 'TEXT');
addCol('orders', 'ip', 'TEXT');
db.exec(String.raw`
CREATE INDEX IF NOT EXISTS idx_orders_provider ON orders(provider_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_invoice_no ON orders(invoice_no) WHERE invoice_no IS NOT NULL;
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,                 -- review | message
  book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  rating INTEGER,
  subject TEXT DEFAULT '',
  message TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new', -- reviews: pending | published | hidden   messages: new | resolved
  reply TEXT,
  replied_at TEXT,
  replied_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, type);
CREATE INDEX IF NOT EXISTS idx_feedback_book ON feedback(book_id);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  picture TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  last_login TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE TABLE IF NOT EXISTS customer_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  note TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_email ON customer_notes(email);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT DEFAULT '',
  detail TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  kind TEXT DEFAULT '',
  status TEXT NOT NULL,               -- sent | failed | skipped
  error TEXT DEFAULT ''
);
`);

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const DEFAULT_SETTINGS = {
  store_name: 'PrepPath E-books Store',
  legal_name: 'PrepPath',
  address: '',
  support_email: '',
  tax_id: '',
  tax_rate: '0',
  currency: 'INR',
  tax_name: 'GST',
  invoice_prefix: 'INV-',
  require_approval: 'false', // 'true' = admin must approve each payment and invoice before the customer gets downloads/invoice
  tz_offset_minutes: '330',  // reporting timezone offset from UTC (330 = India, IST)
  invoice_notes: 'Thank you for your purchase. Your digital products are available instantly from your download page.',
};

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return s;
}

/** Record an admin/system action for the audit trail. */
export function audit(actor, action, target = '', detail = '') {
  db.prepare('INSERT INTO audit_log (at, actor, action, target, detail) VALUES (?,?,?,?,?)').run(new Date().toISOString(), actor || 'system', action, String(target), String(detail).slice(0, 500));
}

/** Next sequential, gap-free invoice number, e.g. INV-2026-00042 (call inside a transaction). */
export function nextInvoiceNo() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'invoice_seq'").get();
  const seq = (row ? Number(row.value) : 0) + 1;
  db.prepare("INSERT INTO settings (key, value) VALUES ('invoice_seq', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(seq));
  return getSettings().invoice_prefix + new Date().getFullYear() + '-' + String(seq).padStart(5, '0');
}

export function slugify(t) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}


/* Seed: only the admin account. Books, coupons and orders are created by you in the admin panel. */
export function seedIfEmpty() {
  if (!db.prepare('SELECT COUNT(*) c FROM admins').get().c) {
    const email = process.env.ADMIN_EMAIL || 'admin@preppath.store';
    const pass = process.env.ADMIN_PASSWORD || 'admin123';
    if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
      console.warn('WARNING: ADMIN_PASSWORD is not set; using the insecure default password. Set it before going live.');
    }
    db.prepare('INSERT INTO admins (email,name,password_hash) VALUES (?,?,?)').run(email.trim().toLowerCase(), 'Admin', hashPassword(pass));
  }
}
