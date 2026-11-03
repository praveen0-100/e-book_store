import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, pct, fmtDateTime } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';

/** Polls an admin endpoint every minute so the dashboard stays current without a reload. */
function useLive(path, ms = 60000) {
  const [data, setData] = useState(null);
  const [at, setAt] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => api(path).then((d) => { if (alive) { setData(d); setAt(new Date()); } }).catch(() => {});
    load();
    const t = setInterval(load, ms);
    return () => { alive = false; clearInterval(t); };
  }, [path, ms]);
  return [data, at];
}

function Change({ cur, prev }) {
  const d = pct(cur, prev);
  if (!prev && !cur) return <small className="muted">vs yesterday —</small>;
  return <small className={d >= 0 ? 'delta up' : 'delta down'} style={{ display: 'inline-flex' }}>{d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(0)}% <span className="muted" style={{ marginLeft: 4, fontWeight: 400 }}>vs yesterday</span></small>;
}

const dayLabel = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });

export function TodayPanel() {
  const [o, at] = useLive('/admin/overview');
  if (!o) return <div className="skeleton" style={{ height: 150, marginBottom: 20 }} />;
  const { today: t, yesterday: y, attention: a } = o;
  const peak = Math.max(...o.hours.map((h) => h.revenue), 1);
  const nowH = new Date(Date.now() + (o.tz || 0) * 60000).getUTCHours();
  const tiles = [
    ['Revenue today', money(t.revenue), t.revenue, y.revenue],
    ['Orders today', t.orders, t.orders, y.orders],
    ['Books sold', t.units, t.units, y.units],
    ['New customers', t.newCustomers, t.newCustomers, y.newCustomers],
    ['Refunds', money(t.refunds), t.refunds, y.refunds],
  ];
  const items = [
    ['/admin/approvals', 'Payments awaiting approval', a.paymentApprovals],
    ['/admin/approvals', 'Invoices to issue', a.invoiceApprovals],
    ['/admin/feedback', 'Reviews to moderate', a.reviewsToModerate],
    ['/admin/feedback', 'Messages to answer', a.messagesToAnswer],
    ['/admin/books', 'Books missing a file', a.booksWithoutFile],
    ['/admin/system', 'Failed emails (24h)', a.failedEmails],
  ];
  return (
    <div className="dash-grid" style={{ marginBottom: 16 }}>
      <div className="card card-pad">
        <div className="panel-head"><div><h3>Today</h3><small>Live · updated {at?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div></div>
        <div className="today-grid">
          {tiles.map(([l, v, c, p]) => <div className="t" key={l}><small>{l}</small><b>{v}</b><Change cur={c} prev={p} /></div>)}
        </div>
        <div style={{ marginTop: 18 }}>
          <small className="muted">Revenue by hour (store time)</small>
          <div className="bars-h" role="img" aria-label="Revenue by hour today">
            {o.hours.map((h) => <span key={h.hour} title={`${String(h.hour).padStart(2, '0')}:00 — ${money(h.revenue)} · ${h.orders} orders`} style={{ height: `${Math.max(3, (h.revenue / peak) * 100)}%`, opacity: h.revenue ? 1 : 0.25 }} className={h.hour === nowH ? 'now' : ''} />)}
          </div>
        </div>
      </div>
      <div className="card card-pad">
        <div className="panel-head"><h3>Needs attention</h3></div>
        <div className="attn">
          {items.map(([to, label, n]) => <Link key={label} to={to} className={n ? '' : 'zero'}><span>{label}</span><b>{n}</b></Link>)}
        </div>
        {!o.requireApproval && <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>Orders are approved automatically. <Link to="/admin/settings" style={{ textDecoration: 'underline' }}>Turn on manual approval</Link></p>}
      </div>
    </div>
  );
}

export function DailyAndFeed() {
  const [days, setDays] = useState(14);
  const [rows] = useLive(`/admin/daily?days=${days}`);
  const [feed] = useLive('/admin/activity', 30000);
  return (
    <div className="dash-grid" style={{ marginTop: 16 }}>
      <div className="card">
        <div className="panel-head" style={{ padding: '22px 24px 0' }}>
          <div><h3>Day-by-day report</h3><small>Store timezone</small></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="seg">{[[7, '7D'], [14, '14D'], [30, '30D']].map(([v, l]) => <button key={v} className={days === v ? 'on' : ''} onClick={() => setDays(v)}>{l}</button>)}</div>
            <a className="btn btn-ghost btn-sm" href={`/api/admin/daily.csv?days=${days}`}><Icon name="download" size={15} /> CSV</a>
          </div>
        </div>
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Date</th><th className="num">Revenue</th><th className="num">Orders</th><th className="num">Sold</th><th className="num">Refunds</th><th className="num">New cust.</th><th className="num">Feedback</th></tr></thead>
          <tbody>
            {!rows && <tr><td colSpan={7}><div className="skeleton" style={{ height: 30 }} /></td></tr>}
            {rows?.map((r, i) => (
              <tr key={r.date}>
                <td className="nowrap">{dayLabel(r.date)}{i === 0 && <span className="badge gold" style={{ marginLeft: 8 }}>Today</span>}</td>
                <td className="num"><b>{money(r.revenue)}</b></td><td className="num">{r.orders}</td><td className="num">{r.units}</td>
                <td className="num muted">{r.refunds ? money(r.refunds) : '—'}</td><td className="num">{r.newCustomers}</td><td className="num">{r.feedback}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      <div className="card card-pad">
        <div className="panel-head"><h3>Activity</h3><small>auto-refreshing</small></div>
        <div className="feed">
          {!feed && <div className="skeleton" style={{ height: 60 }} />}
          {feed?.map((e, i) => (
            <div key={i}>
              <i className={e.kind} />
              <div style={{ flex: 1 }}>
                {e.link ? <Link to={e.link}>{e.text}</Link> : e.text}{e.amount ? <b> · {money(e.amount)}</b> : null}
                <small>{fmtDateTime(e.at)}</small>
              </div>
            </div>
          ))}
          {feed && !feed.length && <p className="muted">No activity yet.</p>}
        </div>
      </div>
    </div>
  );
}
