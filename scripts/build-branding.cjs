// Asset compiler: converts the supplied wordmark into vector paths and fits the
// original emblem inside launcher safe zones. Requires sharp (NODE_PATH or npm).
const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function simplify(points, tolerance = 0.65) {
  if (points.length < 3) return points;
  const first = points[0], last = points[points.length - 1];
  const dx = last[0] - first[0], dy = last[1] - first[1];
  let max = 0, split = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - first[0]) * dx + (p[1] - first[1]) * dy) / (dx * dx + dy * dy))) : 0;
    const distance = Math.hypot(p[0] - first[0] - t * dx, p[1] - first[1] - t * dy);
    if (distance > max) { max = distance; split = i; }
  }
  return max > tolerance ? [...simplify(points.slice(0, split + 1), tolerance).slice(0, -1), ...simplify(points.slice(split), tolerance)] : [first, last];
}

function trace(mask, width, height) {
  const edges = new Map();
  const stride = width + 1;
  const edge = (x, y, nx, ny) => {
    const key = y * stride + x;
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push(ny * stride + nx);
  };
  const on = (x, y) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (on(x, y)) {
    if (!on(x, y - 1)) edge(x, y, x + 1, y);
    if (!on(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
    if (!on(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
    if (!on(x - 1, y)) edge(x, y + 1, x, y);
  }
  const paths = [];
  while (edges.size) {
    const start = edges.keys().next().value;
    let current = start;
    const points = [];
    do {
      points.push([current % stride, Math.floor(current / stride)]);
      const next = edges.get(current);
      if (!next?.length) break;
      const step = next.pop();
      if (!next.length) edges.delete(current);
      current = step;
    } while (current !== start);
    if (points.length < 12) continue;
    points.push(points[0]);
    const polygon = simplify(points);
    paths.push('M' + polygon.map(p => p.join(' ')).join('L') + 'Z');
  }
  return paths.join('');
}

async function main() {
  const { data, info } = await sharp(path.join(root, 'public/branding/floorguard-wordmark.png')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const dark = new Uint8Array(width * height), red = new Uint8Array(width * height);
  let left = width, right = 0, top = height, bottom = 0;
  for (let i = 0; i < width * height; i++) {
    const r = data[i * channels], g = data[i * channels + 1], b = data[i * channels + 2];
    dark[i] = Math.max(r, g, b) < 145 ? 1 : 0;
    red[i] = r > 110 && r > g * 1.8 && r > b * 1.8 ? 1 : 0;
    if (dark[i] || red[i]) { const x = i % width, y = Math.floor(i / width); left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${left - 8} ${top - 8} ${right - left + 17} ${bottom - top + 17}" role="img" aria-labelledby="title desc"><title id="title">FLOORGUARD</title><desc id="desc">SMART ANTI-THEFT FLOOR MAT</desc><defs><linearGradient id="ink" x2="0" y2="1"><stop stop-color="#1d262b"/><stop offset="1" stop-color="#0b1013"/></linearGradient><linearGradient id="red" x2="0" y2="1"><stop stop-color="#ff070b"/><stop offset="1" stop-color="#c90008"/></linearGradient></defs><path fill="url(#ink)" fill-rule="evenodd" d="${trace(dark, width, height)}"/><path fill="url(#red)" fill-rule="evenodd" d="${trace(red, width, height)}"/></svg>`;
  await fs.writeFile(path.join(root, 'public/branding/floorguard-wordmark.svg'), svg);
  const icons = path.join(root, 'public/icons');
  await fs.mkdir(icons, { recursive: true });
  const source = path.join(root, 'public/branding/floorguard-logo.png');
  for (const [name, size, fit] of [
    ['icon-192-v2.png', 192, 0.88], ['icon-512-v2.png', 512, 0.88],
    ['maskable-192-v2.png', 192, 0.55], ['maskable-512-v2.png', 512, 0.55],
    ['apple-touch-icon-v2.png', 180, 0.88], ['favicon-v2.png', 48, 0.88],
    ['emblem-v2.png', 256, 0.96],
  ]) {
    const inner = Math.round(size * fit);
    const mark = await sharp(source).resize(inner, inner, { fit: 'contain', background: '#fff' }).png().toBuffer();
    await sharp({ create: { width: size, height: size, channels: 3, background: '#fff' } }).composite([{ input: mark, gravity: 'centre' }]).png({ compressionLevel: 9, palette: true, colours: 256 }).toFile(path.join(icons, name));
  }
  console.log('Vector wordmark and padded PWA icons generated.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
