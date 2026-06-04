// Generates placeholder app assets (icon, splash, adaptive icon, favicon,
// notification icon) as PNGs using only Node built-ins. Run: `npm run gen:assets`.
// Replace these with real artwork before launch.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'assets');
fs.mkdirSync(OUT, { recursive: true });

const PURPLE = [83, 74, 183]; // #534AB7
const WHITE = [255, 255, 255];

// ---- PNG encoder ----
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
};
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- drawing ----
function pointInShield(x, y, cx, cy, w, h) {
  const top = cy - h / 2;
  const shoulder = top + h * 0.55;
  const dx = Math.abs(x - cx);
  if (y < top || y > top + h) return false;
  if (y <= shoulder) {
    const r = w * 0.12;
    if (y < top + r && dx > w / 2 - r) {
      const ddx = dx - (w / 2 - r);
      return ddx * ddx + (top + r - y) * (top + r - y) <= r * r;
    }
    return dx <= w / 2;
  }
  const t = (y - shoulder) / (top + h - shoulder);
  return dx <= (w / 2) * (1 - t * t * 0.85);
}
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}
function pointInCheck(x, y, cx, cy, w) {
  const th = w * 0.075;
  const ax = cx - w * 0.2,
    ay = cy + w * 0.02;
  const bx = cx - w * 0.05,
    by = cy + w * 0.16;
  const dx2 = cx + w * 0.22,
    dy2 = cy - w * 0.14;
  return distToSeg(x, y, ax, ay, bx, by) <= th || distToSeg(x, y, bx, by, dx2, dy2) <= th;
}

function blend(dst, i, color, a) {
  dst[i] = Math.round(dst[i] * (1 - a) + color[0] * a);
  dst[i + 1] = Math.round(dst[i + 1] * (1 - a) + color[1] * a);
  dst[i + 2] = Math.round(dst[i + 2] * (1 - a) + color[2] * a);
  dst[i + 3] = Math.max(dst[i + 3], Math.round(255 * a));
}

// mode: 'icon' (purple bg, white shield, purple check),
//       'mark' (transparent bg, white shield + purple check),
//       'white' (transparent bg, white silhouette — for notifications)
function draw(width, height, mode, scale = 0.62) {
  const rgba = Buffer.alloc(width * height * 4);
  const bg = mode === 'icon' ? PURPLE : [0, 0, 0];
  const bgA = mode === 'icon' ? 1 : 0;
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = bg[0];
    rgba[i * 4 + 1] = bg[1];
    rgba[i * 4 + 2] = bg[2];
    rgba[i * 4 + 3] = Math.round(255 * bgA);
  }
  const cx = width / 2;
  const cy = height / 2;
  const m = Math.min(width, height);
  const w = m * scale;
  const h = w * 1.18;
  const ss = 2; // 2x supersampling for smooth edges
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let shield = 0;
      let check = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss;
          const py = y + (sy + 0.5) / ss;
          if (pointInShield(px, py, cx, cy, w, h)) shield++;
          if (pointInCheck(px, py, cx, cy, w)) check++;
        }
      const n = ss * ss;
      const i = (y * width + x) * 4;
      if (mode === 'white') {
        if (shield) blend(rgba, i, WHITE, shield / n);
      } else {
        if (shield) blend(rgba, i, WHITE, shield / n);
        if (check) blend(rgba, i, mode === 'icon' ? PURPLE : PURPLE, check / n);
      }
    }
  }
  return encodePNG(width, height, rgba);
}

const targets = [
  ['icon.png', 1024, 1024, 'icon', 0.62],
  ['adaptive-icon.png', 1024, 1024, 'mark', 0.5],
  ['splash.png', 1284, 1284, 'mark', 0.42],
  ['favicon.png', 64, 64, 'icon', 0.62],
  ['notification-icon.png', 96, 96, 'white', 0.7],
];
for (const [name, w, h, mode, scale] of targets) {
  fs.writeFileSync(path.join(OUT, name), draw(w, h, mode, scale));
  console.log('wrote', name, `${w}x${h}`);
}
console.log('Done. Placeholder assets in', OUT);
