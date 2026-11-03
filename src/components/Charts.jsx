import { useRef, useState } from 'react';
import { moneyShort, money } from '../lib/api.js';

export const PALETTE = ['#d4af6a', '#7aa2ff', '#5fd3a2', '#b79cff', '#ff9f7a', '#7ad7f0', '#ff7a90'];

/** Responsive area/line chart with hover crosshair + tooltip. */
export function AreaChart({ data, valueKey = 'revenue', format = money, height = 280 }) {
  const W = 860, H = height, PL = 52, PR = 14, PT = 14, PB = 30;
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const vals = data.map((d) => d[valueKey]);
  const max = Math.max(...vals, 1);
  const nice = (() => {
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s * 4 >= max) || p * 10;
    return step * 4;
  })();
  const x = (i) => PL + (i / Math.max(data.length - 1, 1)) * (W - PL - PR);
  const y = (v) => PT + (1 - v / nice) * (H - PT - PB);
  const pts = data.map((d, i) => [x(i), y(d[valueKey])]);
  // smooth path (catmull-rom -> bezier)
  const path = pts.map((p, i) => {
    if (i === 0) return `M${p[0]},${p[1]}`;
    const p0 = pts[i - 2] || pts[i - 1], p1 = pts[i - 1], p2 = p, p3 = pts[i + 1] || p;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    return `C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }).join(' ');
  const area = `${path} L${x(data.length - 1)},${H - PB} L${x(0)},${H - PB} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelEvery = Math.ceil(data.length / 7);

  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PL) / (W - PL - PR)) * (data.length - 1));
    setHover(Math.min(Math.max(i, 0), data.length - 1));
  };
  const h = hover != null ? data[hover] : null;

  return (
    <div style={{ position: 'relative' }}>
      <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Revenue over time">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d4af6a" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#d4af6a" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lineStroke" x1="0" x2="1"><stop offset="0%" stopColor="#a8823f" /><stop offset="60%" stopColor="#f3dca3" /><stop offset="100%" stopColor="#d4af6a" /></linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PL} x2={W - PR} y1={y(nice * t)} y2={y(nice * t)} stroke="rgba(255,255,255,.07)" strokeDasharray={t ? '3 5' : ''} />
            <text x={PL - 10} y={y(nice * t) + 4} textAnchor="end">{valueKey === 'revenue' ? moneyShort(nice * t) : Math.round(nice * t)}</text>
          </g>
        ))}
        {data.map((d, i) => i % labelEvery === 0 && (
          <text key={d.date} x={x(i)} y={H - 8} textAnchor="middle">{new Date(d.date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</text>
        ))}
        <path d={area} fill="url(#areaFill)" />
        <path d={path} fill="none" stroke="url(#lineStroke)" strokeWidth="2.5" strokeLinecap="round" />
        {h && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PT} y2={H - PB} stroke="rgba(255,255,255,.25)" strokeDasharray="3 4" />
            <circle cx={x(hover)} cy={y(h[valueKey])} r="5.5" fill="#0a0a0f" stroke="#f3dca3" strokeWidth="2.5" />
          </g>
        )}
      </svg>
      {h && (
        <div className="tip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(h[valueKey]) / H) * 100}%` }}>
          <span className="muted">{new Date(h.date + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          <b>{format(h[valueKey])}</b>
          <span className="muted">{h.orders} order{h.orders === 1 ? '' : 's'}</span>
        </div>
      )}
    </div>
  );
}

export function Sparkline({ values, color = '#d4af6a', width = 120, height = 44 }) {
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const pts = values.map((v, i) => `${(i / Math.max(values.length - 1, 1)) * width},${height - 4 - ((v - min) / (max - min || 1)) * (height - 10)}`);
  const id = 'sp' + color.replace('#', '');
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".3" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <polygon points={`0,${height} ${pts.join(' ')} ${width},${height}`} fill={`url(#${id})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function Donut({ data, size = 170, valueKey = 'sales', format = money }) {
  const total = data.reduce((a, d) => a + d[valueKey], 0) || 1;
  const R = 62, C = 2 * Math.PI * R;
  let acc = 0;
  const [active, setActive] = useState(null);
  const cur = active != null ? data[active] : null;
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox="0 0 160 160" role="img" aria-label="Share by category">
        <g transform="rotate(-90 80 80)">
          <circle cx="80" cy="80" r={R} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth="18" />
          {data.map((d, i) => {
            const frac = d[valueKey] / total;
            const el = (
              <circle key={d.name} cx="80" cy="80" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth={active === i ? 22 : 18}
                strokeDasharray={`${Math.max(frac * C - 2, 0)} ${C}`} strokeDashoffset={-acc * C} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} style={{ transition: 'stroke-width .2s' }} />
            );
            acc += frac;
            return el;
          })}
        </g>
        <text x="80" y="76" textAnchor="middle" style={{ fill: '#efebe2', fontSize: 17, fontWeight: 700, fontFamily: 'Poppins, sans-serif' }}>{cur ? `${Math.round((cur[valueKey] / total) * 100)}%` : format(total).replace(/\.00$/, '')}</text>
        <text x="80" y="94" textAnchor="middle" style={{ fill: '#9b978d', fontSize: 9.5 }}>{cur ? cur.name : 'total'}</text>
      </svg>
      <div className="legend" style={{ flex: 1, minWidth: 140 }}>
        {data.map((d, i) => (
          <div key={d.name} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
            <span><i style={{ background: PALETTE[i % PALETTE.length] }} />{d.name}</span>
            <b>{Math.round((d[valueKey] / total) * 100)}%</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BarList({ items, labelKey, valueKey, format = money, sub }) {
  const max = Math.max(...items.map((i) => i[valueKey]), 1);
  return (
    <div className="barlist">
      {items.map((it) => (
        <div className="bar-item" key={it[labelKey]}>
          <div className="top"><span>{it[labelKey]}{sub && <span className="muted"> · {sub(it)}</span>}</span><b>{format(it[valueKey])}</b></div>
          <div className="track"><div className="fill" style={{ width: `${(it[valueKey] / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export function WeekdayBars({ data }) {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const full = names.map((n, i) => ({ n, v: data.find((d) => d.dow === i)?.revenue || 0 }));
  const max = Math.max(...full.map((f) => f.v), 1);
  return (
    <svg className="chart" viewBox="0 0 300 150" role="img" aria-label="Revenue by weekday">
      {full.map((f, i) => {
        const h = (f.v / max) * 105;
        return (
          <g key={f.n}>
            <rect x={i * 42 + 8} y={120 - h} width="28" height={h} rx="6" fill={f.v === max ? '#d4af6a' : 'rgba(212,175,106,.28)'}><title>{f.n}: {money(f.v)}</title></rect>
            <text x={i * 42 + 22} y="142" textAnchor="middle">{f.n}</text>
          </g>
        );
      })}
    </svg>
  );
}
