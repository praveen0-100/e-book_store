import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import Invoice from '../components/Invoice.jsx';
import NotFound from './NotFound.jsx';

export default function InvoicePage() {
  const { token } = useParams();
  const [order, setOrder] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => { api(`/orders/${token}`).then(setOrder).catch(() => setMissing(true)); }, [token]);
  if (missing || order?.status === 'pending' || order?.status === 'failed') return <NotFound />;
  if (order && order.invoice_status !== 'issued') {
    return <div className="container" style={{ maxWidth: 560, padding: '90px 0', textAlign: 'center' }}><h1 style={{ fontSize: 30 }}>Your invoice is being prepared</h1><p className="muted" style={{ margin: '12px 0 24px' }}>It will be emailed to {order.email} and appear here as soon as your payment is verified.</p><Link to={`/order/${token}`} className="btn btn-ghost">Back to order</Link></div>;
  }
  if (!order) return <div className="container" style={{ padding: 80 }}><div className="skeleton" style={{ height: 500 }} /></div>;
  return (
    <div className="container" style={{ padding: '40px 0 80px' }}>
      <Link to={`/order/${token}`} className="muted no-print" style={{ display: 'inline-block', marginBottom: 16 }}>← Back to order</Link>
      <Invoice order={order} />
    </div>
  );
}
