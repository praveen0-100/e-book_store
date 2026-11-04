/**
 * Makes a store cover in the house style (1600x2560, dark background, big stacked colour title,
 * short rule, subtitle, one illustration, author line), the same look as Prompt Smart and Quantum Computing Decoded.
 *
 *   node scripts/make-cover.mjs scripts/covers/business.json
 *
 * Spec (JSON):
 *   { "out": "src/e-books/My-Book-Cover.png",
 *     "bg": "#0b0f24",
 *     "title": [["BUSINESS", "#f59e0b", 230], ["& ENTREPRENEURSHIP", "#ffffff", 118]],   // [text, colour, font-size]
 *     "rule": "#ffffff",
 *     "subtitle": ["line one", "line two", "line three"],
 *     "art": "bars" | "resume" | "chat" | "sphere" | "none",
 *     "accent": "#40e0d0",
 *     "author": "PRAVEEN PRABAKARAN" }
 *
 * Needs Chrome or Edge installed (used headless to render the PNG). Then upload the PNG as the book's cover in Admin > Books.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const specFile = process.argv[2];
if (!specFile) { console.error('Usage: node scripts/make-cover.mjs <spec.json>'); process.exit(1); }
const s = { bg: '#0b0f24', rule: '#ffffff', accent: '#40e0d0', art: 'none', author: 'PRAVEEN PRABAKARAN', subtitle: [], ...JSON.parse(fs.readFileSync(specFile, 'utf8')) };
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const ART = {
  none: () => '',
  bars: (a) => `<g transform="translate(55,0)">
    ${[[250, 120, '#2a3560'], [450, 260, '#1b4b8a'], [650, 400, '#14697a'], [850, 560, '#12806a'], [1050, 740, '#18c06c']].map(([x, h, c]) => `<rect x="${x}" y="${760 - h}" width="190" height="${h}" rx="18" fill="${c}"/>`).join('')}
    <path d="M230 560 L1200 90" stroke="${a}" stroke-width="22" stroke-linecap="round" fill="none"/>
    <path d="M1230 70 L1150 70 L1200 150 Z" fill="${a}" transform="rotate(-12 1200 100)"/>
  </g>`,
  resume: (a) => `<g>
    <rect x="360" y="40" width="880" height="680" rx="40" fill="#f4f6fb"/>
    <rect x="360" y="40" width="880" height="110" rx="40" fill="#e8ecf5"/>
    <rect x="430" y="210" width="300" height="34" rx="8" fill="#e11d48"/><rect x="430" y="270" width="720" height="22" rx="8" fill="#b8c0d4"/><rect x="430" y="316" width="620" height="22" rx="8" fill="#b8c0d4"/>
    <rect x="430" y="400" width="300" height="34" rx="8" fill="${a}"/><rect x="430" y="460" width="720" height="22" rx="8" fill="#b8c0d4"/><rect x="430" y="506" width="560" height="22" rx="8" fill="#b8c0d4"/>
    <rect x="430" y="590" width="300" height="34" rx="8" fill="#e11d48"/><rect x="430" y="650" width="640" height="22" rx="8" fill="#b8c0d4"/>
    <circle cx="1160" cy="660" r="105" fill="#16c172"/><path d="M1105 660 L1148 705 L1225 620" stroke="#fff" stroke-width="30" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </g>`,
  chat: (a) => `<g>
    <path d="M250 40 H1350 a60 60 0 0 1 60 60 V470 a60 60 0 0 1 -60 60 H640 L520 660 V530 H250 a60 60 0 0 1 -60 -60 V100 a60 60 0 0 1 60 -60 Z" fill="#241d4f" stroke="${a}" stroke-width="10"/>
    <text x="330" y="230" font-size="86" font-weight="700" fill="#fff" font-family="Consolas, monospace">&gt; Ask clearly.</text>
  </g>`,
  sphere: (a) => `<g transform="translate(800,380)">
    <circle r="330" fill="none" stroke="#4a5aa8" stroke-width="5"/><ellipse rx="330" ry="105" fill="none" stroke="#4a5aa8" stroke-width="4"/><line y1="-360" y2="360" stroke="#4a5aa8" stroke-width="4"/>
    <line x2="90" y2="-170" stroke="${a}" stroke-width="12" stroke-linecap="round"/><circle cx="90" cy="-170" r="26" fill="${a}"/><circle r="14" fill="#fff"/>
  </g>`,
};

let y = 130;
const titleSvg = s.title.map(([t, c, size = 200]) => { y += size * 0.95; const out = `<text x="800" y="${y}" font-size="${size}" fill="${c}" text-anchor="middle" font-weight="800">${esc(t)}</text>`; y += size * 0.12; return out; }).join('');
const ruleY = y + 50;
const artY = ruleY + 110 + s.subtitle.length * 76 + 50;
const subSvg = s.subtitle.map((t, i) => `<text x="800" y="${ruleY + 110 + i * 76}" font-size="58" fill="#d6dbf0" text-anchor="middle">${esc(t)}</text>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2560" viewBox="0 0 1600 2560" font-family="Verdana, 'DejaVu Sans', 'Segoe UI', Arial, sans-serif">
  <rect width="1600" height="2560" fill="${s.bg}"/>
  ${titleSvg}
  <rect x="600" y="${ruleY}" width="400" height="8" fill="${s.rule}"/>
  ${subSvg}
  <g transform="translate(0,${artY})">${(ART[s.art] || ART.none)(s.accent)}</g>
  <text x="800" y="2330" font-size="72" font-weight="700" fill="#fff" text-anchor="middle">${esc(s.author)}</text>
</svg>`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-'));
const html = path.join(dir, 'c.html');
fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:${s.bg}}svg{display:block}</style>${svg}`);
const out = path.resolve(s.out || 'cover.png');
const browsers = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const exe = browsers.find((b) => fs.existsSync(b));
if (!exe) { console.error('Chrome or Edge not found'); process.exit(1); }
const r = spawnSync(exe, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${path.join(dir, 'p')}`, `--screenshot=${out}`, '--window-size=1600,2560', 'file:///' + html.replace(/\\/g, '/')], { stdio: 'pipe', timeout: 60000 });
if (!fs.existsSync(out)) { console.error('Render failed', r.stderr?.toString().slice(0, 300)); process.exit(1); }
console.log('Cover written:', out);
