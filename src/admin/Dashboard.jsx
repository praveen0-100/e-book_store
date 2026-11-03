import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, pct, fmtDateTime } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import { AreaChart, BarList, Donut, Sparkline, WeekdayBars } from '../components/Charts.jsx';
import { PageHead, StatusBadge, useAdmin } from './AdminLayout.jsx';
import { TodayPanel, DailyAndFeed } from './DashboardLive.jsx';

function Delta({ cur, prev, invert }) {
  const d = pct(cur, prev);
  const good = invert ? d <= 0 : d >= 0;
  if (Math.abs(d) < 0.05) return <span className="delta flat">— no change</span>;
  return <span className={`delta ${good ? 'up' : 'down'}`}><Icon name={d >= 0 ? 'arrow-up' : 'arrow-down'} size={13} stroke={2.4} />{Math.abs(d).toFixed(1)}% <span className="muted" style={{ fontWeight: 400 }}>vs prev.</span></span>;
}

export default function Dashboard() {
  const user = useAdmin();
  const [days, setDays] = useState(30);
  const [d, setD] = useState(null);
  const [metric, setMetric] = useState('revenue');
  const [err, setErr] = useState('');

  useEffect(() => {
    setErr('');
    api(`/admin/analytics?days=${days}`).then(setD).catch((e) => setErr(e.message));
  }, [days]);

  const kpis = d && [
    ['Revenue', money(d.cur.revenue), d.cur.revenue, d.prev.revenue, 'dollar', d.series.map((s) => s.revenue), '#d4af6a'],
    ['Orders', d.cur.orders.toLocaleString(), d.cur.orders, d.prev.orders, 'orders', d.series.map((s) => s.orders), '#7aa2ff'],
    ['Avg. order value', money(d.cur.aov), d.cur.aov, d.prev.aov, 'chart', null, '#5fd3a2'],
    ['Books sold', d.cur.units.toLocaleString(), d.cur.units, d.prev.units, 'book', null, '#b79cff'],
    ['Customers', d.cur.customers.toLocaleString(), d.cur.customers, d.prev.customers, 'users', null, '#7ad7f0'],
    ['Refunds', money(d.cur.refunds), d.cur.refunds, d.prev.refunds, 'refresh', null, '#ff7a90', true],
  ];

  return (
    <>
      <PageHead title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${user.name.split(' ')[0]}`} sub="Here’s how your store is performing.">
        <div className="seg" role="tablist">
          {[[7, '7D'], [30, '30D'], [90, '90D'], [365, '1Y']].map(([v, l]) => <button key={v} className={days === v ? 'on' : ''} onClick={() => setDays(v)}>{l}</button>)}
        </div>
      </PageHead>

      <TodayPanel />

      {err && <div className="error-box">{err}</div>}
      {!d && !err && <div className="kpis">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" style={{ height: 130 }} />)}</div>}

      {d && (
        <div className="fade-in">
          <div className="kpis">
            {kpis.map(([label, val, cur, prev, ic, spark, color, invert]) => (
              <div className="card kpi" key={label}>
                <div className="lbl">{label}<Icon name={ic} size={17} /></div>
                <div className="val">{val}</div>
                <Delta cur={cur} prev={prev} invert={invert} />
                {spark && <Sparkline values={spark} color={color} />}
              </div>
            ))}
          </div>

          <div className="dash-grid">
            <div className="card card-pad">
              <div className="panel-head">
                <div><h3>{metric === 'revenue' ? 'Revenue' : 'Orders'} over time</h3><small>Last {days} days · lifetime {money(d.totals.lifetimeRevenue)} from {d.totals.lifetimeOrders.toLocaleString()} orders</small></div>
                <div className="seg"><button className={metric === 'revenue' ? 'on' : ''} onClick={() => setMetric('revenue')}>Revenue</button><button className={metric === 'orders' ? 'on' : ''} onClick={() => setMetric('orders')}>Orders</button></div>
              </div>
              <AreaChart data={d.series} valueKey={metric} format={metric === 'revenue' ? money : (v) => `${v} orders`} />
            </div>
            <div className="card card-pad">
              <div className="panel-head"><h3>Sales by category</h3></div>
              {d.categories.length ? <Donut data={d.categories} /> : <p className="muted">No sales in this period.</p>}
            </div>
          </div>

          <div className="dash-grid-3">
            <div className="card card-pad">
              <div className="panel-head"><h3>Top selling books</h3><small>by sales</small></div>
              {d.topBooks.length ? <BarList items={d.topBooks} labelKey="title" valueKey="sales" sub={(b) => `${b.units} sold`} /> : <p className="muted">No sales yet.</p>}
            </div>
            <div className="card card-pad">
              <div className="panel-head"><h3>Revenue by weekday</h3></div>
              <WeekdayBars data={d.weekdays} />
              <div className="legend" style={{ marginTop: 14 }}>
                <div><span>Tax collected</span><b>{money(d.cur.tax)}</b></div>
                <div><span>Discounts given</span><b>{money(d.cur.discounts)}</b></div>
                <div><span>Refunded orders</span><b>{d.cur.refundCount}</b></div>
              </div>
            </div>
            <div className="card card-pad">
              <div className="panel-head"><h3>Payment methods</h3></div>
              {d.brands.length ? <BarList items={d.brands} labelKey="name" valueKey="amount" sub={(b) => `${b.n} orders`} /> : <p className="muted">No payments yet.</p>}
            </div>
          </div>

          <div className="card">
            <div className="panel-head" style={{ padding: '22px 24px 0' }}><h3>Recent orders</h3><Link to="/admin/orders" className="btn btn-ghost btn-sm">View all</Link></div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Items</th><th>Status</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {d.recent.map((o) => (
                    <tr key={o.id}>
                      <td><Link to={`/admin/orders/${o.id}`} style={{ color: 'var(--gold)', fontWeight: 600 }}>{o.number}</Link></td>
                      <td><b style={{ fontWeight: 500 }}>{o.name}</b><div className="muted" style={{ fontSize: 12.5 }}>{o.email}</div></td>
                      <td className="muted">{fmtDateTime(o.created_at)}</td>
                      <td>{o.item_count}</td>
                      <td><StatusBadge status={o.status} approval={o.approval_status} /></td>
                      <td className="num"><b>{money(o.total_cents)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <DailyAndFeed />
        </div>
      )}
    </>
  );
}
