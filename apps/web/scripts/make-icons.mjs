// Erzeugt die App-Icons (PNG) ohne Zusatzbibliothek: ein Stundenplan-Blatt auf der Akzentfarbe.
// Aufruf: node scripts/make-icons.mjs (Ergebnis liegt in public/icons und wird eingecheckt).
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const PRIMARY = [79, 70, 229];
const WHITE = [255, 255, 255];
const AMBER = [217, 119, 6];

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const inRoundRect = (x, y, [x0, y0, x1, y1], r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

/** Motiv in Einheiten 0..512; `full` = randlos (maskable, Apple), sonst abgerundetes Quadrat. */
function shapes(full, scale) {
  const s = (v) => 256 + (v - 256) * scale;
  const rect = (x0, y0, x1, y1) => [s(x0), s(y0), s(x1), s(y1)];
  const list = [{ rect: [0, 0, 512, 512], r: full ? 0 : 112, color: PRIMARY }];
  list.push({ rect: rect(120, 150, 392, 392), r: 32 * scale, color: WHITE });
  list.push({ rect: rect(172, 112, 204, 182), r: 14 * scale, color: WHITE });
  list.push({ rect: rect(308, 112, 340, 182), r: 14 * scale, color: WHITE });
  const cols = [156, 232, 308];
  const rows = [212, 292];
  rows.forEach((y, ri) =>
    cols.forEach((x, ci) =>
      list.push({
        rect: rect(x, y, x + 52, y + 52),
        r: 12 * scale,
        color: ri === 1 && ci === 2 ? AMBER : PRIMARY,
      }),
    ),
  );
  return list;
}

function render(size, full, scale) {
  const list = shapes(full, scale);
  const out = Buffer.alloc(size * size * 4);
  const N = 4;
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < N; sy++)
        for (let sx = 0; sx < N; sx++) {
          const x = ((px + (sx + 0.5) / N) / size) * 512;
          const y = ((py + (sy + 0.5) / N) / size) * 512;
          let color = null;
          for (const sh of list) if (inRoundRect(x, y, sh.rect, sh.r)) color = sh.color;
          if (color) {
            r += color[0];
            g += color[1];
            b += color[2];
            a += 1;
          }
        }
      const i = (py * size + px) * 4;
      out[i] = a ? Math.round(r / a) : 0;
      out[i + 1] = a ? Math.round(g / a) : 0;
      out[i + 2] = a ? Math.round(b / a) : 0;
      out[i + 3] = Math.round((a / (N * N)) * 255);
    }
  return png(size, out);
}

const dir = new URL('../public/icons/', import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL('icon-192.png', dir), render(192, false, 1));
writeFileSync(new URL('icon-512.png', dir), render(512, false, 1));
writeFileSync(new URL('maskable-512.png', dir), render(512, true, 0.8));
writeFileSync(new URL('apple-touch-icon.png', dir), render(180, true, 0.85));
writeFileSync(new URL('favicon-32.png', dir), render(32, false, 1));
console.log('Icons geschrieben: public/icons');
