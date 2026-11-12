/**
 * Draws the admin app icons (public/admin-icons/*.png): a gold rounded tile with an open book on a dark background.
 *   node scripts/make-pwa-icons.mjs
 */
import fs from 'node:fs';
import { PNG } from 'pngjs';

const OUT = 'public/admin-icons';
fs.mkdirSync(OUT, { recursive: true });

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const sdRound = (x, y, cx, cy, hw, hh, r) => {
  const qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const cover = (d) => Math.min(1, Math.max(0, 0.5 - d)); // 1px anti-aliased edge

/** size px square; tile = fraction of the canvas the gold tile fills; bg = fill the whole canvas (maskable/apple) */
function draw(size, tile, full) {
  const png = new PNG({ width: size, height: size });
  const dark = [11, 11, 18], g1 = [243, 220, 163], g2 = [168, 130, 63], ink = [26, 20, 8];
  const c = size / 2, half = (size * tile) / 2, rad = half * 0.28;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let px = full ? dark : [0, 0, 0], a = full ? 1 : 0;
    const dt = sdRound(x + 0.5, y + 0.5, c, c, half, half, rad);
    const at = cover(dt);
    if (at > 0) {
      const t = Math.min(1, Math.max(0, ((x + y) / (2 * size) - (0.5 - tile / 2)) / tile)); // gold gradient
      const gold = mix(g1, g2, t);
      px = full ? mix(px, gold, at) : gold; a = full ? 1 : at;
      // open book: two pages, each a rounded rect, with a gap for the spine
      const u = half * 0.74, gap = half * 0.05;
      const left = sdRound(x + 0.5, y + 0.5, c - u / 2 - gap, c + u * 0.02, u / 2 - gap, u * 0.55, u * 0.1);
      const right = sdRound(x + 0.5, y + 0.5, c + u / 2 + gap, c + u * 0.02, u / 2 - gap, u * 0.55, u * 0.1);
      const ab = Math.max(cover(left), cover(right));
      px = mix(px, ink, ab * 0.92);
    }
    const i = (y * size + x) * 4;
    png.data[i] = px[0]; png.data[i + 1] = px[1]; png.data[i + 2] = px[2]; png.data[i + 3] = Math.round(a * 255);
  }
  return PNG.sync.write(png);
}

fs.writeFileSync(`${OUT}/icon-192.png`, draw(192, 0.82, false));
fs.writeFileSync(`${OUT}/icon-512.png`, draw(512, 0.82, false));
fs.writeFileSync(`${OUT}/icon-maskable-512.png`, draw(512, 0.58, true)); // content stays inside the 80% safe zone
fs.writeFileSync(`${OUT}/apple-touch-icon.png`, draw(180, 0.72, true));
console.log('icons written to', OUT);
