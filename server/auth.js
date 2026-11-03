import crypto from 'node:crypto';

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET must be set in production.');
  process.exit(1);
}
const SECRET = process.env.SESSION_SECRET || 'dev-only-secret-change-me-in-production';
export const COOKIE = 'preppath_admin';

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(pw, salt, 64);
  const a = Buffer.from(hash, 'hex');
  return a.length === test.length && crypto.timingSafeEqual(a, test);
}

const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');

export function makeSession(admin) {
  const body = b64(JSON.stringify({ id: admin.id, email: admin.email, name: admin.name, exp: Date.now() + 1000 * 60 * 60 * 12 }));
  return `${body}.${sign(body)}`;
}

export function readSession(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

export function requireAdmin(req, res, next) {
  const s = readSession(req.cookies?.[COOKIE]);
  if (!s) return res.status(401).json({ error: 'Authentication required' });
  req.admin = s;
  next();
}

/* ---- storefront customer sessions (Google sign-in). Signed with a different key than admin sessions. ---- */
export const USER_COOKIE = 'preppath_user';
const userSign = (b) => crypto.createHmac('sha256', SECRET + ':customer-session').update(b).digest('base64url');

export function makeUserSession(u) {
  const body = b64(JSON.stringify({ id: u.id, email: u.email, name: u.name, picture: u.picture || '', exp: Date.now() + 1000 * 60 * 60 * 24 * 30 }));
  return `${body}.${userSign(body)}`;
}
export function readUserSession(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = userSign(body);
  if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try { const d = JSON.parse(Buffer.from(body, 'base64url').toString()); return d.exp > Date.now() ? d : null; } catch { return null; }
}
/** Attaches req.user when a valid customer cookie is present (never blocks). */
export function attachUser(req, res, next) { req.user = readUserSession(req.cookies?.[USER_COOKIE]); next(); }
