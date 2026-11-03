import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import { useToast } from '../lib/context.jsx';
import { PageHead } from './AdminLayout.jsx';

export default function Coupons() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [code, setCode] = useState('');
  const [percent, setPercent] = useState(15);
  const load = () => api('/admin/coupons').then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    try { await api('/admin/coupons', { method: 'POST', body: { code, percent } }); setCode(''); toast('Promo code created'); load(); } catch (err) { toast(err.message, 'err'); }
  };
  const toggle = async (c) => { await api(`/admin/coupons/${c.id}`, { method: 'PUT', body: { active: !c.active } }); load(); };
  const remove = async (c) => { await api(`/admin/coupons/${c.id}`, { method: 'DELETE' }); toast('Promo code deleted'); load(); };

  return (
    <>
      <PageHead title="Promotions" sub="Create discount codes customers can apply at checkout." />
      <form className="card card-pad" onSubmit={add} style={{ display: 'flex', gap: 14, alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="field"><label htmlFor="code">Code</label><input id="code" className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SUMMER25" required /></div>
        <div className="field"><label htmlFor="pc">Discount %</label><input id="pc" className="input" type="number" min="1" max="90" value={percent} onChange={(e) => setPercent(e.target.value)} required style={{ width: 120 }} /></div>
        <button className="btn btn-gold"><Icon name="plus" size={17} /> Create code</button>
      </form>
      <div className="card"><div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Code</th><th>Discount</th><th className="num">Redemptions</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows?.map((c) => (
              <tr key={c.id}>
                <td><b style={{ letterSpacing: '.08em' }}>{c.code}</b></td>
                <td>{c.percent}% off</td>
                <td className="num">{c.uses}</td>
                <td>{c.active ? <span className="badge green">Active</span> : <span className="badge">Paused</span>}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggle(c)}>{c.active ? 'Pause' : 'Activate'}</button>{' '}
                  <button className="icon-btn" style={{ display: 'inline-grid' }} onClick={() => remove(c)} aria-label={`Delete ${c.code}`}><Icon name="trash" size={16} /></button>
                </td>
              </tr>
            ))}
            {rows && !rows.length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 36 }}>No promo codes yet.</td></tr>}
          </tbody>
        </table>
      </div></div>
    </>
  );
}
