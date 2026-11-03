import { money, fmtDate, payLabel } from '../lib/api.js';
import { Icon } from './Icon.jsx';

/** Printable invoice (paper style). Used by customers and the admin panel. */
export default function Invoice({ order, admin = false }) {
  const s = order.settings || {};
  const refunded = order.status === 'refunded';
  return (
    <>
      <div className="invoice-actions no-print">
        <a className="btn btn-gold btn-sm" href={admin ? `/api/admin/orders/${order.id}/invoice.pdf` : `/api/orders/${order.token}/invoice.pdf`} target="_blank" rel="noreferrer"><Icon name="download" size={16} /> Download PDF</a>
        <button className="btn btn-ghost btn-sm" onClick={() => window.print()}><Icon name="print" size={16} /> Print</button>
      </div>
      <article className="invoice" id="invoice">
        <div className={`paid-stamp ${refunded ? 'refunded' : ''}`}>{refunded ? 'REFUNDED' : 'PAID'}</div>
        <header className="inv-head">
          <div>
            <div className="brand">{s.store_name}</div>
            <div className="brand-sub">{s.legal_name}{'\n'}{s.address}{'\n'}{s.support_email}{s.tax_id ? `\n${s.tax_name || 'Tax'} ID: ${s.tax_id}` : ''}</div>
          </div>
          <div>
            <h1>TAX INVOICE</h1>
            <div className="inv-no">{order.invoice_no || `Draft · ${order.number}`}</div>
          </div>
        </header>
        <section className="meta">
          <div><small>Billed to</small><b>{order.name}</b><br />{order.email}</div>
          <div><small>Invoice date</small>{fmtDate(order.invoice_issued_at || order.created_at)}<br /><small style={{ marginTop: 10 }}>Order</small>{order.number}</div>
          <div><small>Payment</small>{payLabel(order)}<br /><span style={{ color: '#8a8a93', fontSize: 12 }}>Ref {order.payment_ref}</span></div>
        </section>
        <table>
          <thead><tr><th>Description</th><th style={{ width: 70, textAlign: 'center' }}>Qty</th><th style={{ width: 120 }}>Amount</th></tr></thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.id}>
                <td><b>{i.title}</b><small>{i.author} · Digital edition</small></td>
                <td style={{ textAlign: 'center' }}>1</td>
                <td>{money(i.price_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="totals">
          <div><span>Subtotal</span><span>{money(order.subtotal_cents)}</span></div>
          {order.discount_cents > 0 && <div><span>Discount{order.coupon ? ` (${order.coupon})` : ''}</span><span>−{money(order.discount_cents)}</span></div>}
          <div><span>{s.tax_name || 'Tax'} ({order.tax_rate}%)</span><span>{money(order.tax_cents)}</span></div>
          <div className="grand"><span>Total</span><span>{money(order.total_cents)}</span></div>
          {refunded && <div style={{ color: '#d6455b' }}><span>Refunded {order.refunded_at ? fmtDate(order.refunded_at) : ''}</span><span>−{money(order.total_cents)}</span></div>}
        </div>
        <footer className="inv-foot">
          <span style={{ maxWidth: 420 }}>{s.invoice_notes}</span>
          <span>Page 1 of 1</span>
        </footer>
      </article>
    </>
  );
}
