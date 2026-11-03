import { db } from './db.js';
import { USER_COOKIE, makeUserSession } from './auth.js';
import { verifyGoogleIdToken } from './google.js';
import { serializeOrder, canDownload } from './orders.js';
import { rateLimit } from './security.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 30 * 24 * 3600 * 1000, path: '/' };
const publicUser = (u) => (u ? { id: u.id, email: u.email, name: u.name, picture: u.picture || '' } : null);

/** Customer accounts via Google. Optional for shoppers unless REQUIRE_LOGIN_TO_BUY=true. */
export function mountAuth(app) {
  const limiter = rateLimit({ name: 'auth', windowMs: 10 * 60 * 1000, max: 30, message: 'Too many sign-in attempts. Please wait a few minutes.' });

  app.post('/api/auth/google', limiter, wrap(async (req, res) => {
    const g = await verifyGoogleIdToken(req.body?.credential);
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO customers (google_sub,email,name,picture,created_at,last_login) VALUES (?,?,?,?,?,?)
      ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email, name=excluded.name, picture=excluded.picture, last_login=excluded.last_login`)
      .run(g.sub, g.email, g.name, g.picture, now, now);
    const user = db.prepare('SELECT * FROM customers WHERE google_sub = ?').get(g.sub);
    res.cookie(USER_COOKIE, makeUserSession(user), cookieOpts);
    res.json({ user: publicUser(user) });
  }));

  app.get('/api/auth/me', (req, res) => res.json({ user: publicUser(req.user) }));

  app.post('/api/auth/logout', (req, res) => { res.clearCookie(USER_COOKIE, { path: '/' }); res.json({ ok: true }); });

  /** The signed-in customer's purchases (matched on their Google-verified email). */
  app.get('/api/account/orders', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
    const rows = db.prepare("SELECT * FROM orders WHERE email = ? AND status != 'pending' ORDER BY created_at DESC").all(req.user.email);
    res.json(rows.map((o) => ({ ...serializeOrder(o), can_download: canDownload(o) })));
  });
}
