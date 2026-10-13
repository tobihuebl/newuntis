#!/usr/bin/env node
/**
 * Kontrast-Check (Design System, Umsetzung Abschnitt 7.3): prüft die Text-Hintergrund-Paare aus den Hinweisen in
 * docs/design-system/tokens.json in beiden Themes nach WCAG 2.2 (Text 4.5:1, Bedienelemente und Flächen 3:1) und
 * schreibt die Tabelle nach docs/kontrast.md.
 *
 *   node scripts/check-contrast.mjs          Tabelle schreiben, Exit 1 bei einem Verstoß
 *   node scripts/check-contrast.mjs --check  zusätzlich Exit 1, wenn docs/kontrast.md veraltet ist (CI)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const tokens = JSON.parse(readFileSync(join(root, 'docs/design-system/tokens.json'), 'utf8'));
const colors = Object.fromEntries(tokens.color.tokens.map((t) => [t.name, t.value]));
const THEMES = tokens.color.themes.map((t) => t.id);

const TEXT = 4.5;
const UI = 3;
const FACH = Object.keys(colors).filter((n) => n.startsWith('fach-'));

/**
 * Paare aus den Hinweisen ("usage") der Tokens: [Vordergrund, Hintergründe, Mindestwert, Hinweis].
 * Themes, in denen ein Paar laut Hinweis nicht vorkommt, stehen in `only`.
 */
const PAIRS = [
  ['ink', ['bg', 'bg-raised', 'bg-sunken', 'brand-soft', 'signal-soft', 'neutral-soft'], TEXT],
  ['ink-muted', ['bg', 'bg-raised', 'bg-sunken', 'neutral-soft'], TEXT],
  ['ink-subtle', ['bg', 'bg-raised'], TEXT],
  ['ink-on-night', ['bg-night', 'bg-night-raised'], TEXT],
  ['ink-on-night-muted', ['bg-night', 'bg-night-raised'], TEXT],
  ['on-brand', ['brand', 'brand-hover'], TEXT],
  ['brand-text', ['bg', 'bg-raised', 'brand-soft'], TEXT],
  ['on-signal', ['signal'], TEXT],
  ['signal-ink', ['signal-soft'], TEXT],
  ['on-danger', ['danger'], TEXT],
  ['danger-ink', ['danger-soft'], TEXT],
  ['on-fach', FACH, TEXT],
  // Zusätzlich im App-Code verwendete Paare (Leerkacheln, Hinweise auf weichen Flächen)
  ['ink-subtle', ['bg-sunken'], TEXT, 'leere Kachel'],
  ['ink-muted', ['brand-soft', 'signal-soft', 'danger-soft'], TEXT, 'Zusatztext in Hinweisen'],
  ['brand-text', ['bg-sunken'], TEXT, 'Links in Tracks'],
  ['line-strong', ['bg', 'bg-raised'], UI, 'Rand von Bedienelementen'],
  ['brand', ['bg', 'bg-raised'], UI, 'Primärbutton-Fläche'],
  ['focus', ['bg', 'bg-raised'], UI, 'Fokusring'],
  ['signal', ['bg-night'], UI, 'Fokusring auf Nachtflächen', ['light']],
  ['focus', ['bg-night'], UI, 'Fokusring auf Nachtflächen', ['dark']],
];

function channel(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function parse(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 || h.length === 4 ? [...h].map((x) => x + x).join('') : h;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
}
function luminance(hex) {
  const [r, g, b] = parse(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const rows = [];
let failures = 0;
for (const [fg, bgs, min, note, only] of PAIRS) {
  for (const bg of bgs) {
    const cells = THEMES.map((theme) => {
      if (only && !only.includes(theme)) return '–';
      const r = ratio(colors[fg][theme], colors[bg][theme]);
      const ok = r >= min;
      if (!ok) failures++;
      return `${r.toFixed(2)} ${ok ? 'ok' : '**zu schwach**'}`;
    });
    rows.push(
      `| \`${fg}\` | \`${bg}\` | ${min}:1${note ? ` (${note})` : ''} | ${cells.join(' | ')} |`,
    );
  }
}

const md = `# Kontrast der Farb-Tokens

Erzeugt von \`scripts/check-contrast.mjs\` aus \`docs/design-system/tokens.json\` (nicht von Hand ändern).
Paare laut den Hinweisen der Tokens; Mindestwerte nach WCAG 2.2 AA: Text 4.5:1, Bedienelemente und Fokusring 3:1.
Auf Nachtflächen gilt im hellen Theme Amber als Fokusring (Hinweis zu \`focus\`).

| Vordergrund | Hintergrund | Mindestwert | ${THEMES.map((t) => tokens.color.themes.find((x) => x.id === t).name).join(' | ')} |
| --- | --- | --- | ${THEMES.map(() => '---').join(' | ')} |
${rows.join('\n')}

Ergebnis: ${failures === 0 ? 'alle Paare bestehen.' : `${failures} Paare zu schwach.`}
`;

const out = join(root, 'docs/kontrast.md');
if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(out, 'utf8');
  } catch {
    // fehlt noch
  }
  if (current !== md) {
    console.error('docs/kontrast.md ist veraltet: node scripts/check-contrast.mjs ausführen.');
    process.exit(1);
  }
} else writeFileSync(out, md);

if (failures) {
  console.error(`Kontrast: ${failures} Paare unter dem Mindestwert (siehe docs/kontrast.md).`);
  process.exit(1);
}
console.log(`Kontrast: ${rows.length} Paare, alle bestehen.`);
