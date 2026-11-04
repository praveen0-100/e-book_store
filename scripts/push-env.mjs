/**
 * Pushes payment / email / Google credentials from your local .env to the Vercel project, then redeploys.
 *
 *   npm run setup:keys            validate, push to Vercel (production), redeploy
 *   npm run setup:keys -- --dry   validate only, change nothing
 *
 * Each credential is checked against the real service first, so a typo is caught here and not by a customer:
 *   Razorpay keys -> a read-only call to Razorpay's API
 *   SMTP          -> a real login to your mail server (no email is sent)
 * Empty values are skipped. Nothing is printed or logged except variable names.
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import nodemailer from 'nodemailer';

const DRY = process.argv.includes('--dry');
const NAMES = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'GOOGLE_CLIENT_ID', 'REQUIRE_LOGIN_TO_BUY', 'UPI_ID', 'UPI_NAME', 'SUPPORT_EMAIL', 'BUSINESS_ADDRESS'];
const SECRET = new Set(['RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'SMTP_PASS']);

const parse = (text) => Object.fromEntries(text.split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^(["'])(.*)\1$/, '$2')]));
const env = fs.existsSync('.env') ? parse(fs.readFileSync('.env', 'utf8')) : {};
const vals = Object.fromEntries(NAMES.filter((n) => env[n]).map((n) => [n, env[n]]));
const problems = [];
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { problems.push(m); console.log('  ✗', m); };

if (!Object.keys(vals).length) {
  console.log('No values found. Open .env, fill in the lines you have (Razorpay, SMTP, Google), save, and run this again.');
  process.exit(0);
}
console.log('Found:', Object.keys(vals).join(', '), '\n');

/* ---- Razorpay ---- */
const rp = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'];
if (rp.some((n) => vals[n])) {
  console.log('Razorpay');
  if (!rp.every((n) => vals[n])) bad('Both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required together.');
  else if (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(vals.RAZORPAY_KEY_ID)) bad('RAZORPAY_KEY_ID should look like rzp_test_xxxxxxxx or rzp_live_xxxxxxxx.');
  else {
    try {
      const r = await fetch('https://api.razorpay.com/v1/orders?count=1', { headers: { Authorization: 'Basic ' + Buffer.from(`${vals.RAZORPAY_KEY_ID}:${vals.RAZORPAY_KEY_SECRET}`).toString('base64') }, signal: AbortSignal.timeout(15000) });
      if (r.ok) ok(`keys accepted by Razorpay (${vals.RAZORPAY_KEY_ID.startsWith('rzp_live_') ? 'LIVE mode: real money' : 'test mode'})`);
      else bad(`Razorpay rejected these keys (HTTP ${r.status}). Check the Key ID / Secret pair and that they are from the same mode.`);
    } catch (e) { bad(`Could not reach Razorpay: ${e.message}`); }
  }
  if (!vals.RAZORPAY_WEBHOOK_SECRET) console.log('  ! RAZORPAY_WEBHOOK_SECRET is empty: orders will not complete if a customer closes the tab mid-payment. Add the webhook in the Razorpay dashboard and put its secret here.');
}

/* ---- SMTP ---- */
const smtp = ['SMTP_HOST', 'SMTP_FROM'];
if (['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'].some((n) => vals[n])) {
  console.log('Email (SMTP)');
  if (!smtp.every((n) => vals[n])) bad('SMTP_HOST and SMTP_FROM are required.');
  else if (!/@/.test(vals.SMTP_FROM)) bad('SMTP_FROM should contain an address, e.g. "PrepPath <orders@your-domain.com>".');
  else {
    try {
      const port = Number(vals.SMTP_PORT) || 587;
      await nodemailer.createTransport({ host: vals.SMTP_HOST, port, secure: port === 465, auth: vals.SMTP_USER ? { user: vals.SMTP_USER, pass: vals.SMTP_PASS } : undefined, connectionTimeout: 15000 }).verify();
      ok(`logged in to ${vals.SMTP_HOST}:${port} (no email was sent)`);
    } catch (e) { bad(`SMTP login failed: ${e.message}`); }
  }
}

/* ---- Google ---- */
if (vals.GOOGLE_CLIENT_ID) {
  console.log('Google sign-in');
  if (/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(vals.GOOGLE_CLIENT_ID)) ok('client ID format looks right');
  else bad('GOOGLE_CLIENT_ID should end in .apps.googleusercontent.com');
}

if (problems.length) { console.log(`\n${problems.length} problem(s). Nothing was pushed. Fix .env and run again.`); process.exit(1); }
if (DRY) { console.log('\nDry run: everything checks out. Run without --dry to push and redeploy.'); process.exit(0); }

/* ---- push + redeploy ---- */
console.log('\nPushing to Vercel (production)');
const vercel = (args, input) => spawnSync('vercel', args, { input, encoding: 'utf8', shell: process.platform === 'win32' });
for (const [name, value] of Object.entries(vals)) {
  const r = vercel(['env', 'add', name, 'production', '--force', ...(SECRET.has(name) ? ['--sensitive'] : [])], value);
  if (r.status === 0) ok(name); else { bad(`${name}: ${(r.stderr || r.stdout || '').trim().split('\n').pop()}`); }
}
if (problems.length) { console.log('\nSome variables failed to upload; skipping redeploy.'); process.exit(1); }
console.log('\nRedeploying…');
const d = vercel(['--prod', '--yes']);
console.log(d.status === 0 ? 'Done. The new settings are live.' : (d.stderr || d.stdout || 'Deploy failed').split('\n').slice(-6).join('\n'));
process.exit(d.status ?? 1);
