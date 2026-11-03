import crypto from 'node:crypto';

/**
 * "Sign in with Google" for storefront customers (never used for the admin panel).
 *
 * The browser gets a signed Google ID token from Google Identity Services. We verify it ourselves
 * against Google's published public keys (RS256), check audience/issuer/expiry and that the email
 * is verified, then issue our own signed, HttpOnly session cookie.
 * Env: GOOGLE_CLIENT_ID  (Google Cloud Console -> APIs & Services -> Credentials -> OAuth client ID, "Web application")
 */
export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID);
export const googleClientId = () => process.env.GOOGLE_CLIENT_ID || '';

const JWKS_URL = process.env.GOOGLE_JWKS_URL || 'https://www.googleapis.com/oauth2/v3/certs'; // overridable for tests
let jwks = { keys: [], fetchedAt: 0 };

async function getKey(kid) {
  const fresh = Date.now() - jwks.fetchedAt < 6 * 3600 * 1000;
  let jwk = fresh && jwks.keys.find((k) => k.kid === kid);
  if (!jwk) {
    const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error('Could not fetch Google signing keys');
    jwks = { keys: (await res.json()).keys || [], fetchedAt: Date.now() };
    jwk = jwks.keys.find((k) => k.kid === kid);
  }
  if (!jwk) throw new Error('Unknown signing key');
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

const fail = (message) => Object.assign(new Error(message), { status: 401 });

/** Verifies a Google ID token and returns { sub, email, name, picture }. Throws a 401 error if invalid. */
export async function verifyGoogleIdToken(idToken) {
  if (!googleEnabled()) throw Object.assign(new Error('Google sign-in is not configured.'), { status: 503 });
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw fail('Invalid Google token.');
  let header, payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  } catch { throw fail('Invalid Google token.'); }
  if (header.alg !== 'RS256') throw fail('Invalid Google token.');
  let ok = false;
  try {
    ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), await getKey(header.kid), Buffer.from(parts[2], 'base64url'));
  } catch { throw fail('Could not verify the Google token.'); }
  if (!ok) throw fail('Invalid Google token signature.');
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== googleClientId()) throw fail('Google token was issued for a different app.');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) throw fail('Invalid Google token issuer.');
  if (!(payload.exp > now - 30)) throw fail('Google token has expired. Please try again.');
  if (!payload.sub || !payload.email || payload.email_verified !== true) throw fail('Your Google email address is not verified.');
  return { sub: String(payload.sub), email: String(payload.email).toLowerCase(), name: String(payload.name || payload.email.split('@')[0]).slice(0, 120), picture: String(payload.picture || '') };
}
