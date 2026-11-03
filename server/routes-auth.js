import crypto from 'node:crypto';
import { db, audit } from './db.js';
import { USER_COOKIE, makeUserSession, hashPassword, verifyPassword } from './auth.js';
import { verifyGoogleIdToken } from './google.js';
import { serializeOrder, canDownload } from './orders.js';
import { sendMail, layout, esc, publicUrl, emailEnabled } from './mailer.js';
import { rateLimit } from './security.js';

const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 30 * 24 * 3600 * 1000, path: '/' };
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 160;
const fail = (res, status, error) => res.status(status).json({ error });
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const DUMMY_HASH = hashPassword('not-a-real-password'); // burned on unknown emails so response time doesn't reveal which accounts exist
const MIN_PASSWORD = 8;

const publicUser = (u) => (u ? { id: u.id, email: u.email, name: u.name, picture: u.picture || '', email_verified: !!u.email_verified, has_password: !!u.password_hash, has_google: !!u.google_sub } : null);
const setSession = (res, u) => res.cookie(USER_COOKIE, makeUserSession(u), cookieOpts);
const byEmail = (email) => db.prepare('SELECT * FROM customers WHERE lower(email) = ?').get(email.toLowerCase());

/** Per-account throttle on top of the per-IP limiter (stops slow password guessing from many IPs). */
const failures = new Map();
const tooMany = (key) => { const r = failures.get(key); return r && Date.now() - r.t < 15 * 60 * 1000 && r.n >= 8; };
const noteFail = (key) => { const r = failures.get(key); if (!r || Date.now() - r.t >= 15 * 60 * 1000) failures.set(key, { n: 1, t: Date.now() }); else r.n++; };

async function issueToken(customerId, kind, ttlMs) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.prepare('DELETE FROM auth_tokens WHERE customer_id = ? AND kind = ?').run(customerId, kind); // only the newest link works
  await db.prepare('INSERT INTO auth_tokens (customer_id, kind, token_hash, expires_at) VALUES (?,?,?,?)').run(customerId, kind, sha(token), new Date(Date.now() + ttlMs).toISOString());
  return token;
}
/** Consumes a single-use token; returns the customer row or null. */
async function takeToken(token, kind) {
  const row = await db.prepare('SELECT * FROM auth_tokens WHERE token_hash = ? AND kind = ?').get(sha(String(token || '')), kind);
  if (!row) return null;
  await db.prepare('DELETE FROM auth_tokens WHERE id = ?').run(row.id);
  if (new Date(row.expires_at) < new Date()) return null;
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(row.customer_id);
}

async function sendVerification(user) {
  const token = await issueToken(user.id, 'verify', 24 * 3600 * 1000);
  const url = `${publicUrl()}/verify?token=${token}`;
  await sendMail({
    to: user.email, kind: 'verify-email', subject: 'Confirm your email address',
    html: layout('Confirm your email', `<p>Hi ${esc(user.name.split(' ')[0])},</p><p>Thanks for signing up. Please confirm your email address to see your order history across devices. The link is valid for 24 hours.</p>`, { label: 'Confirm email', url }),
  });
  return token;
}

/** Test-only escape hatch so automated tests can complete the email flows without an inbox. Never active in production. */
const debugTokens = () => process.env.AUTH_DEBUG_TOKENS === 'true' && process.env.NODE_ENV !== 'production' && !process.env.VERCEL;

/** Customer accounts: sign up with credentials, log in with email+password or Google. Optional unless REQUIRE_LOGIN_TO_BUY=true. */
export function mountAuth(app) {
  const ipLimit = (name, max, windowMs = 10 * 60 * 1000) => rateLimit({ name, windowMs, max, message: 'Too many attempts. Please wait a few minutes and try again.' });

  /* ---- sign up with credentials ---- */
  app.post('/api/auth/register', ipLimit('register', 20, 60 * 60 * 1000), async (req, res) => {
    const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (name.length < 2) return fail(res, 400, 'Please enter your full name.');
    if (!isEmail(email)) return fail(res, 400, 'Please enter a valid email address.');
    if (password.length < MIN_PASSWORD) return fail(res, 400, `Use at least ${MIN_PASSWORD} characters for your password.`);
    if (password.length > 128) return fail(res, 400, 'That password is too long.');
    if (/^(password|12345678|qwertyui)/i.test(password)) return fail(res, 400, 'That password is too easy to guess. Please choose another.');
    if (await byEmail(email)) return fail(res, 409, 'An account with this email already exists. Please log in instead.');
    const now = new Date().toISOString();
    const id = await db.insert('INSERT INTO customers (email,name,password_hash,email_verified,created_at,last_login) VALUES (?,?,?,0,?,?)', email, name, hashPassword(password), now, now);
    const user = await db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    const token = await sendVerification(user);
    setSession(res, user);
    await audit(email, 'customer.registered', '', req.ip);
    res.json({ user: publicUser(user), verification_email: emailEnabled(), ...(debugTokens() ? { dev_verify_token: token } : {}) });
  });

  /* ---- log in with credentials ---- */
  app.post('/api/auth/login', ipLimit('login', 20), async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!isEmail(email) || !password) return fail(res, 400, 'Enter your email and password.');
    if (tooMany(email)) return fail(res, 429, 'Too many failed attempts for this account. Try again in 15 minutes or reset your password.');
    const user = await byEmail(email);
    const ok = verifyPassword(password, user?.password_hash || DUMMY_HASH); // constant work whether or not the account exists
    if (!user || !user.password_hash) {
      noteFail(email);
      if (user?.google_sub) return fail(res, 401, 'This email is registered with Google. Use “Continue with Google”, or reset your password to add one.');
      return fail(res, 401, 'Incorrect email or password.');
    }
    if (!ok) { noteFail(email); return fail(res, 401, 'Incorrect email or password.'); }
    failures.delete(email);
    await db.prepare('UPDATE customers SET last_login = ? WHERE id = ?').run(new Date().toISOString(), user.id);
    setSession(res, user);
    res.json({ user: publicUser(user) });
  });

  /* ---- log in / sign up with Google ---- */
  app.post('/api/auth/google', ipLimit('google', 30), async (req, res) => {
    const g = await verifyGoogleIdToken(req.body?.credential);
    const now = new Date().toISOString();
    let user = await db.prepare('SELECT * FROM customers WHERE google_sub = ?').get(g.sub);
    if (!user) user = await byEmail(g.email);
    if (user) { // existing account (Google or password): link Google and trust the email, which Google has verified
      await db.prepare('UPDATE customers SET google_sub = ?, email_verified = 1, picture = ?, last_login = ? WHERE id = ?').run(g.sub, g.picture || user.picture || '', now, user.id);
    } else {
      const id = await db.insert('INSERT INTO customers (google_sub,email,name,picture,email_verified,created_at,last_login) VALUES (?,?,?,?,1,?,?)', g.sub, g.email, g.name, g.picture, now, now);
      user = { id };
    }
    user = await db.prepare('SELECT * FROM customers WHERE id = ?').get(user.id);
    setSession(res, user);
    res.json({ user: publicUser(user) });
  });

  /* ---- session ---- */
  app.get('/api/auth/me', async (req, res) => {
    const user = req.user ? await db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id) : null;
    if (req.user && !user) res.clearCookie(USER_COOKIE, { path: '/' }); // account was deleted
    res.json({ user: publicUser(user) });
  });
  app.post('/api/auth/logout', (req, res) => { res.clearCookie(USER_COOKIE, { path: '/' }); res.json({ ok: true }); });

  /* ---- email verification ---- */
  app.post('/api/auth/verify', ipLimit('verify', 30), async (req, res) => {
    const user = await takeToken(req.body?.token, 'verify');
    if (!user) return fail(res, 400, 'This confirmation link is invalid or has expired. Log in and request a new one.');
    await db.prepare('UPDATE customers SET email_verified = 1 WHERE id = ?').run(user.id);
    setSession(res, user);
    res.json({ user: publicUser({ ...user, email_verified: 1 }) });
  });
  app.post('/api/auth/resend-verification', ipLimit('resend', 5, 60 * 60 * 1000), async (req, res) => {
    if (!req.user) return fail(res, 401, 'Please log in first.');
    const user = await db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!user) return fail(res, 401, 'Please log in first.');
    if (user.email_verified) return res.json({ ok: true, already: true });
    const token = await sendVerification(user);
    res.json({ ok: true, email_enabled: emailEnabled(), ...(debugTokens() ? { dev_verify_token: token } : {}) });
  });

  /* ---- password reset ---- */
  app.post('/api/auth/forgot', ipLimit('forgot', 5, 60 * 60 * 1000), async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    let devToken;
    if (isEmail(email)) {
      const user = await byEmail(email);
      if (user) {
        devToken = await issueToken(user.id, 'reset', 3600 * 1000);
        await sendMail({
          to: user.email, kind: 'password-reset', subject: 'Reset your password',
          html: layout('Reset your password', `<p>Hi ${esc(user.name.split(' ')[0])},</p><p>We received a request to reset your password. The link is valid for one hour. If this wasn't you, you can ignore this email.</p>`, { label: 'Choose a new password', url: `${publicUrl()}/reset?token=${devToken}` }),
        });
      }
    }
    res.json({ ok: true, ...(debugTokens() && devToken ? { dev_reset_token: devToken } : {}) }); // identical answer whether or not the account exists
  });
  app.post('/api/auth/reset', ipLimit('reset', 10), async (req, res) => {
    const password = String(req.body?.password || '');
    if (password.length < MIN_PASSWORD || password.length > 128) return fail(res, 400, `Use at least ${MIN_PASSWORD} characters for your password.`);
    const user = await takeToken(req.body?.token, 'reset');
    if (!user) return fail(res, 400, 'This reset link is invalid or has expired. Please request a new one.');
    await db.prepare('UPDATE customers SET password_hash = ?, email_verified = 1, last_login = ? WHERE id = ?').run(hashPassword(password), new Date().toISOString(), user.id); // clicking the emailed link proves they own the address
    await db.prepare("DELETE FROM auth_tokens WHERE customer_id = ? AND kind = 'reset'").run(user.id);
    failures.delete(user.email.toLowerCase());
    await audit(user.email, 'customer.password-reset', '', req.ip);
    setSession(res, user);
    res.json({ user: publicUser({ ...user, email_verified: 1 }) });
  });

  /** The signed-in customer's purchases: those placed while logged in, plus (once the email is verified) any bought as that email. */
  app.get('/api/account/orders', async (req, res) => {
    if (!req.user) return fail(res, 401, 'Please log in.');
    const user = await db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!user) return fail(res, 401, 'Please log in.');
    const rows = await db.prepare("SELECT * FROM orders WHERE status != 'pending' AND (customer_id = ? OR (lower(email) = ? AND ? = 1)) ORDER BY created_at DESC")
      .all(user.id, user.email.toLowerCase(), user.email_verified ? 1 : 0);
    res.json(await Promise.all(rows.map(async (o) => ({ ...(await serializeOrder(o)), can_download: canDownload(o) }))));
  });
}
