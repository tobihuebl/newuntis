#!/usr/bin/env node
/**
 * Token-Lint (Design System, Umsetzung Abschnitt 7.2): durchsucht App-Code und UI-Paket nach Werten, die nicht aus
 * den Tokens kommen. Treffer sind Fehler (Exit-Code 1).
 *
 *   - Hex-Farben und rgb()/hsl() in Code und CSS
 *   - px-Werte in Tailwind-Arbitrary-Values (z. B. p-[12px], text-[11px])
 *   - Tailwind-Standardfarben (bg-blue-500, text-white …) und unbekannte Farbnamen
 *   - Tailwind-Standardgrößen und -gewichte für Schrift (text-sm, font-bold …) statt Token-Stilen (text-body-sm …)
 *   - rounded-full statt rounded-pill
 *   - px für Abstände und Radien in eigenem CSS
 *   - Raster mit Spalten nur ab einer Breite, aber ohne grid-cols für mobil (wächst sonst mit dem Inhalt über 320 px)
 *
 * Ausgenommen: erzeugte Dateien (tokens.css, theme.css, tokens.generated.ts, design-tokens.ts), bundle.css als
 * unveränderte Datei des Design Systems (Audit E1), Tests und E2E.
 *
 * Aufruf: node scripts/check-tokens.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const ROOTS = ['apps/web/src', 'apps/web/app', 'apps/api/src', 'packages/ui/src'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'test-results', 'e2e', 'generated']);
const SKIP_FILES = new Set([
  'packages/ui/src/styles/tokens.css',
  'packages/ui/src/styles/theme.css',
  'packages/ui/src/styles/bundle.css',
  'packages/ui/src/tokens.generated.ts',
]);

// Farb-Utilities aus dem Theme (erzeugt aus tokens.json) und eigene Utilities (base.css, theme.css)
const themeCss = readFileSync(join(root, 'packages/ui/src/styles/theme.css'), 'utf8');
const baseCss = readFileSync(join(root, 'packages/ui/src/styles/base.css'), 'utf8');
const COLORS = new Set([...themeCss.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const UTILITIES = new Set(
  [...`${themeCss}\n${baseCss}`.matchAll(/@utility ([a-z0-9-]+)/g)].map((m) => m[1]),
);

const PALETTE =
  /^(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}$/;
const COLOR_PREFIX =
  /^(bg|text|border|border-[trblxyse]|ring|ring-offset|fill|stroke|outline|divide|decoration|placeholder|accent|caret|from|via|to)-(.+)$/;
/** Nicht-Farb-Werte hinter denselben Präfixen (border-2, ring-0, outline-none, text-center …). */
const NOT_A_COLOR =
  /^(\d+(\.\d+)?|px|none|solid|dashed|dotted|double|hidden|collapse|separate|inset|offset-\d+|[trblxyse]|[trblxyse]-\d+|left|center|right|justify|start|end|balance|pretty|wrap|nowrap|ellipsis|clip|auto|fixed|local|scroll|cover|contain|top|bottom|no-repeat|repeat|origin|padding|content|inherit|transparent|current|opacity-\d+|\[.*\]|\(.*\))$/;
const TW_SIZES = /^text-(xs|sm|base|lg|xl|[2-9]xl)$/;
const TW_WEIGHTS = /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(tsx?|css)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) yield p;
  }
}

/** Klasse ohne Varianten (hover:, md:, [&_x]:, file:) und ohne Deckkraft-Modifikator. */
const bare = (cls) =>
  cls
    .replace(/^!/, '')
    .replace(/^((?:[a-z0-9-]+|\[[^\]]+\]|@[a-z0-9-]+):)+/, '')
    .replace(/\/\d+$/, '');

function classProblems(cls) {
  const c = bare(cls);
  if (!c) return null;
  if (/\[[^\]]*(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i.test(c)) return 'Rohfarbe in Arbitrary-Value';
  if (/\[[^\]]*\d(\.\d+)?px/.test(c)) return 'px in Arbitrary-Value';
  if (c === 'rounded-full') return 'rounded-full statt rounded-pill';
  if (TW_SIZES.test(c)) return 'Tailwind-Schriftgröße statt Token-Stil';
  if (TW_WEIGHTS.test(c)) return 'Tailwind-Schriftgewicht statt Token-Stil';
  if (UTILITIES.has(c)) return null;
  const m = c.match(COLOR_PREFIX);
  if (!m) return null;
  const value = m[2];
  if (value === 'white' || value === 'black' || PALETTE.test(value))
    return 'Tailwind-Standardfarbe';
  if (NOT_A_COLOR.test(value) || COLORS.has(value)) return null;
  if (m[1] === 'text') return 'unbekannter Text-Stil oder Farbe';
  return 'unbekannte Farbe';
}

const findings = [];
const report = (file, line, msg, snippet) =>
  findings.push(`${relative(root, file)}:${line}  ${msg}  ${snippet.trim().slice(0, 90)}`);

for (const base of ROOTS) {
  for (const file of walk(join(root, base))) {
    const rel = relative(root, file);
    if (SKIP_FILES.has(rel)) continue;
    const src = readFileSync(file, 'utf8');
    const isCss = file.endsWith('.css');
    src.split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
      if (/^\s*\*/.test(line)) return; // Kommentarzeile
      if (
        /(?<![\w&/])#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{1,5})?\b/.test(code) &&
        !/href=|#[a-z]+-[a-z]/.test(code)
      )
        report(file, i + 1, 'Hex-Farbe', line);
      if (/\b(rgba?|hsla?)\(/.test(code)) report(file, i + 1, 'rgb()/hsl()', line);
      if (isCss) {
        if (
          /\b(margin|padding|gap|inset|top|left|right|bottom|border-radius)[a-z-]*\s*:[^;]*\d+px/.test(
            code,
          )
        )
          report(file, i + 1, 'px für Abstand oder Radius', line);
        return;
      }
      // Klassen in String-Literalen (className, cn(), cva(), Template-Strings)
      for (const lit of code.matchAll(/(['"`])((?:(?!\1).)*)\1/g)) {
        const text = lit[2];
        // Ids, Verweise und Objektschlüssel sind keine Klassen
        const before = code.slice(0, lit.index).trimEnd();
        if (/(\bid|htmlFor|aria-[a-z]+|key|name|href)=\{?$|\[$/.test(before)) continue;
        if (!/[a-z]-/.test(text) || /^[\w.:/-]+\/[\w./-]+$/.test(text)) continue;
        const classes = text.split(/\s+/);
        if (
          classes.includes('grid') &&
          classes.some((c) => /^[a-z0-9]+:grid-cols-/.test(c)) &&
          !classes.some((c) => c.startsWith('grid-cols-'))
        )
          report(file, i + 1, 'Raster ohne grid-cols für mobil', line);
        for (const cls of classes) {
          const problem = classProblems(cls);
          if (problem) report(file, i + 1, `${problem}: ${cls}`, line);
        }
      }
    });
  }
}

if (findings.length) {
  console.error(`Token-Lint: ${findings.length} Treffer\n${findings.join('\n')}`);
  process.exit(1);
}
console.log('Token-Lint: keine Rohwerte gefunden.');
