import { useEffect, useState } from 'react';
import { api, setCurrency } from '../lib/api.js';
import { useToast } from '../lib/context.jsx';
import { PageHead } from './AdminLayout.jsx';

const ZONES = [['330', 'India (IST, UTC+5:30)'], ['0', 'UTC'], ['60', 'Central Europe (UTC+1)'], ['240', 'Gulf (UTC+4)'], ['480', 'Singapore / China (UTC+8)'], ['-300', 'US Eastern (UTC−5)'], ['-480', 'US Pacific (UTC−8)']];

export default function Settings() {
  const toast = useToast();
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/admin/settings').then(setS).catch((e) => toast(e.message, 'err')); }, []); // eslint-disable-line
  if (!s) return <div className="skeleton" style={{ height: 400 }} />;
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const r = await api('/admin/settings', { method: 'PUT', body: s }); setS(r); setCurrency(r.currency); toast('Settings saved'); } catch (err) { toast(err.message, 'err'); }
    setBusy(false);
  };
  return (
    <>
      <PageHead title="Settings" sub="Business details used on invoices and emails, plus how orders are processed." />
      <form className="card card-pad form-stack" onSubmit={save} style={{ maxWidth: 800 }}>
        <h3 style={{ fontSize: 17 }}>Business</h3>
        <div className="grid-2">
          <div className="field"><label>Store name</label><input className="input" value={s.store_name} onChange={set('store_name')} required /></div>
          <div className="field"><label>Legal / company name</label><input className="input" value={s.legal_name} onChange={set('legal_name')} /></div>
        </div>
        <div className="field"><label>Business address</label><textarea className="input" value={s.address} onChange={set('address')} /></div>
        <div className="grid-2">
          <div className="field"><label>Billing / support email</label><input className="input" type="email" value={s.support_email} onChange={set('support_email')} /></div>
          <div className="field"><label>Tax registration no. (GSTIN)</label><input className="input" value={s.tax_id} onChange={set('tax_id')} placeholder="e.g. 33ABCDE1234F1Z5" /></div>
        </div>

        <h3 style={{ fontSize: 17, marginTop: 8 }}>Tax &amp; invoices</h3>
        <div className="grid-3">
          <div className="field"><label>Tax name</label><input className="input" value={s.tax_name} onChange={set('tax_name')} placeholder="GST" /></div>
          <div className="field"><label>Tax rate (%)</label><input className="input" type="number" step="0.01" min="0" max="50" value={s.tax_rate} onChange={set('tax_rate')} /></div>
          <div className="field"><label>Invoice number prefix</label><input className="input" value={s.invoice_prefix} onChange={set('invoice_prefix')} placeholder="INV-" /></div>
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: -8 }}>Prices are exclusive of tax: the tax rate is added on top at checkout. Invoice numbers are sequential (e.g. {s.invoice_prefix}{new Date().getFullYear()}-00001) and never reused.</p>
        <div className="field"><label>Invoice footer note</label><textarea className="input" style={{ minHeight: 80 }} value={s.invoice_notes} onChange={set('invoice_notes')} /></div>

        <h3 style={{ fontSize: 17, marginTop: 8 }}>Operations</h3>
        <label className="switch">
          <input type="checkbox" checked={s.require_approval === 'true'} onChange={(e) => setS({ ...s, require_approval: String(e.target.checked) })} />
          <span><b>Require manual approval</b><small>Customers pay normally, but downloads and the tax invoice are held until you approve them in Approvals. Rejecting refunds the customer automatically. Leave off for instant delivery.</small></span>
        </label>
        <div className="grid-2">
          <div className="field"><label>Reporting timezone</label>
            <select className="input" value={s.tz_offset_minutes} onChange={set('tz_offset_minutes')}>
              {ZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              {!ZONES.some(([v]) => v === s.tz_offset_minutes) && <option value={s.tz_offset_minutes}>UTC offset {s.tz_offset_minutes} min</option>}
            </select>
          </div>
          <div className="field"><label>Currency (ISO code)</label><input className="input" value={s.currency} onChange={set('currency')} maxLength={3} style={{ textTransform: 'uppercase' }} /></div>
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: -8 }}>The timezone decides where “today” starts in the dashboard and daily report. Currency must be supported by your Razorpay account.</p>
        <div><button className="btn btn-gold" disabled={busy}>{busy ? <span className="spinner" /> : 'Save settings'}</button></div>
      </form>
    </>
  );
}
