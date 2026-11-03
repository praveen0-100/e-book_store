import nodemailer from 'nodemailer';
import { db, getSettings } from './db.js';

/**
 * Transactional email over SMTP (any provider: Gmail app password, Brevo, Amazon SES, Zoho, Mailgun...).
 * Env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (e.g. "PrepPath <orders@yourdomain.com>")
 * Every attempt is written to email_log so the admin can see what was sent, failed or skipped.
 */
let transport;
export const emailEnabled = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
export const publicUrl = () => (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, '');

function getTransport() {
  transport ||= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

const log = (to, subject, kind, status, error = '') =>
  db.prepare('INSERT INTO email_log (at,to_addr,subject,kind,status,error) VALUES (?,?,?,?,?,?)').run(new Date().toISOString(), to, subject, kind, status, String(error).slice(0, 300));

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Branded HTML wrapper. `body` must already be escaped / trusted HTML. */
export function layout(title, body, cta) {
  const s = getSettings();
  return `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:Poppins,Segoe UI,Arial,sans-serif;color:#1d1b16">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden">
<tr><td style="background:#0e0e15;color:#d4af6a;padding:22px 28px;font-size:20px;font-weight:700">${esc(s.store_name)}</td></tr>
<tr><td style="padding:28px"><h2 style="margin:0 0 14px;font-size:20px">${esc(title)}</h2><div style="font-size:14.5px;line-height:1.65">${body}</div>
${cta ? `<p style="margin:26px 0 4px"><a href="${esc(cta.url)}" style="background:#d4af6a;color:#1a1408;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px;display:inline-block">${esc(cta.label)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px;font-size:12px;color:#8a8577;border-top:1px solid #eee">${esc(s.legal_name)}${s.support_email ? ` · ${esc(s.support_email)}` : ''}</td></tr>
</table></td></tr></table></body></html>`;
}
export { esc };

/** Fire-and-forget safe: never throws. Returns true when the message was handed to the SMTP server. */
export async function sendMail({ to, subject, html, text, attachments, kind = '' }) {
  if (!emailEnabled()) { log(to, subject, kind, 'skipped', 'SMTP is not configured'); return false; }
  try {
    const s = getSettings();
    await getTransport().sendMail({ from: process.env.SMTP_FROM, to, subject, html, text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), attachments, replyTo: s.support_email || undefined });
    log(to, subject, kind, 'sent');
    return true;
  } catch (e) {
    console.error('Email failed:', e.message);
    log(to, subject, kind, 'failed', e.message);
    return false;
  }
}
