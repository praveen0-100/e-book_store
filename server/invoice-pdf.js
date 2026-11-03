import PDFDocument from 'pdfkit';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const FONT_DIR = path.join(path.dirname(require.resolve('@fontsource/poppins/package.json')), 'files');
const font = (w) => path.join(FONT_DIR, `poppins-latin-${w}-normal.woff`);

const inr = (cents, currency) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR' }).format((cents || 0) / 100);
const date = (iso, offsetMin = 0) => new Date(new Date(iso).getTime() + offsetMin * 60000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Renders a tax invoice as a PDF Buffer (Poppins, A4). */
export function renderInvoicePdf(order, settings) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Invoice ${order.invoice_no || order.number}`, Author: settings.store_name } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont('R', font(400)); doc.registerFont('M', font(500)); doc.registerFont('S', font(600)); doc.registerFont('B', font(700));

    const off = Number(settings.tz_offset_minutes) || 0;
    const L = 48, R = 547, W = R - L;
    const ink = '#17171c', mute = '#6b6b75', gold = '#a8823f';
    const refunded = order.status === 'refunded';

    // Header
    doc.font('B').fontSize(20).fillColor(ink).text(settings.store_name, L, 48);
    doc.font('R').fontSize(9).fillColor(mute).text([settings.legal_name, settings.address, settings.support_email, settings.tax_id && `${settings.tax_name || 'Tax'} ID: ${settings.tax_id}`].filter(Boolean).join('\n'), L, 74, { width: 280 });
    doc.font('B').fontSize(26).fillColor(ink).text('TAX INVOICE', 300, 48, { width: R - 300, align: 'right' });
    doc.font('M').fontSize(11).fillColor(gold).text(order.invoice_no || order.number, 300, 82, { width: R - 300, align: 'right' });
    doc.font('R').fontSize(9).fillColor(mute).text(`Order ${order.number}`, 300, 98, { width: R - 300, align: 'right' });

    // Meta
    const y0 = 150;
    doc.moveTo(L, y0 - 10).lineTo(R, y0 - 10).strokeColor('#e3e0d8').lineWidth(1).stroke();
    const meta = (label, lines, x) => {
      doc.font('S').fontSize(8).fillColor(mute).text(label.toUpperCase(), x, y0, { characterSpacing: 0.8 });
      doc.font('R').fontSize(10).fillColor(ink).text(lines, x, y0 + 14, { width: 160 });
    };
    meta('Billed to', `${order.name}\n${order.email}`, L);
    meta('Invoice date', `${date(order.invoice_issued_at || order.created_at, off)}`, L + 190);
    meta('Payment', `${order.card_last4 ? `${order.card_brand} •••• ${order.card_last4}` : order.card_brand || '—'}\nRef ${order.payment_ref || '—'}`, L + 360);

    // Table
    let y = 225;
    doc.rect(L, y, W, 24).fill('#f4f1ea');
    doc.font('S').fontSize(8.5).fillColor(mute).text('DESCRIPTION', L + 10, y + 8).text('QTY', 380, y + 8, { width: 40, align: 'center' }).text('AMOUNT', R - 110, y + 8, { width: 100, align: 'right' });
    y += 32;
    for (const it of order.items) {
      doc.font('M').fontSize(10.5).fillColor(ink).text(it.title, L + 10, y, { width: 300 });
      doc.font('R').fontSize(8.5).fillColor(mute).text(`${it.author} · Digital edition`, L + 10, y + 15, { width: 300 });
      doc.font('R').fontSize(10).fillColor(ink).text('1', 380, y, { width: 40, align: 'center' }).text(inr(it.price_cents, settings.currency), R - 110, y, { width: 100, align: 'right' });
      y += 38;
      doc.moveTo(L, y - 6).lineTo(R, y - 6).strokeColor('#eeebe3').stroke();
    }

    // Totals
    y += 8;
    const row = (label, value, bold) => {
      doc.font(bold ? 'B' : 'R').fontSize(bold ? 12 : 10).fillColor(bold ? ink : mute).text(label, 330, y, { width: 110 }).text(value, R - 110, y, { width: 100, align: 'right' });
      y += bold ? 24 : 18;
    };
    row('Subtotal', inr(order.subtotal_cents, settings.currency));
    if (order.discount_cents > 0) row(`Discount${order.coupon ? ` (${order.coupon})` : ''}`, '−' + inr(order.discount_cents, settings.currency));
    row(`${settings.tax_name || 'Tax'} (${order.tax_rate}%)`, inr(order.tax_cents, settings.currency));
    doc.moveTo(330, y - 2).lineTo(R, y - 2).strokeColor(ink).lineWidth(1.5).stroke(); y += 6;
    row('Total', inr(order.total_cents, settings.currency), true);
    if (refunded) { doc.fillColor('#d6455b'); row('Refunded', '−' + inr(order.total_cents, settings.currency)); }

    // Stamp
    doc.save().rotate(-12, { origin: [470, 190] }).font('B').fontSize(22).fillColor(refunded ? '#d6455b' : '#1f9d6b').opacity(0.8)
      .text(refunded ? 'REFUNDED' : 'PAID', 400, 175, { width: 150, align: 'center' }).restore();

    // Footer
    doc.font('R').fontSize(8.5).fillColor(mute).text(settings.invoice_notes || '', L, 760, { width: W - 120 });
    doc.font('R').fontSize(8.5).fillColor(mute).text('This is a computer-generated invoice.', R - 200, 760, { width: 200, align: 'right' });
    doc.end();
  });
}
