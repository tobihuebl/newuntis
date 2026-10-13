#!/usr/bin/env node
/**
 * Erzeugt aus docs/design-system/tokens.json (einzige Quelle, PROfessor Design System):
 *   packages/ui/src/styles/tokens.css   CSS-Variablen je Theme (hell, dunkel, System)
 *   packages/ui/src/styles/theme.css    Tailwind-Anbindung (@theme, Typo-, Schatten- und Ebenen-Utilities)
 *   packages/ui/src/styles/bundle.css   Referenz-CSS der Komponenten (unverändert aus dem Design System)
 *   packages/shared/src/design-tokens.ts Farbwerte für Manifest, E-Mails und PDF (kein Hex im App-Code)
 *
 * Aufruf: node scripts/gen-theme.mjs          schreibt die Dateien
 *         node scripts/gen-theme.mjs --check  prüft nur, ob sie aktuell sind (CI)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'docs/design-system');
const tokens = JSON.parse(readFileSync(join(src, 'tokens.json'), 'utf8'));
const check = process.argv.includes('--check');

const HEADER =
  '/* Erzeugt von scripts/gen-theme.mjs aus docs/design-system/tokens.json. Nicht von Hand ändern. */\n';

/** Typo-Stile, die mobil (unter bp-lg) kleiner sind (ui-grundlagen Abschnitt 2). */
const MOBILE = {
  'display-xl': { fontSize: '48px', lineHeight: '50px', letterSpacing: '-0.035em' },
  h1: { fontSize: '28px', lineHeight: '32px' },
  h2: { fontSize: '22px', lineHeight: '28px' },
};
/** next/font legt die Schriftdateien als Variablen an (apps/web/app/layout.tsx). */
const FONT_VARS = { display: '--font-bricolage', text: '--font-dmsans', mono: '--font-jetbrains' };

const colors = tokens.color.tokens;
const shadows = tokens.shadow.tokens;
const breakpoints = Object.fromEntries(tokens.breakpoint.tokens.map((t) => [t.name, t.value]));
const lg = breakpoints['bp-lg'];

function themeBlock(theme) {
  const lines = [`  color-scheme: ${theme};`];
  for (const c of colors) lines.push(`  --${c.name}: ${c.value[theme]};`);
  for (const s of shadows) lines.push(`  --${s.name}: ${s.value[theme]};`);
  return lines.join('\n');
}

function tokensCss() {
  const fixed = [
    ...tokens.spacing.tokens,
    ...tokens.radius.tokens,
    ...tokens.zIndex.tokens,
    ...tokens.breakpoint.tokens,
  ].map((t) => `  --${t.name}: ${t.value};`);
  const fam = tokens.type.families;
  for (const [k, v] of Object.entries(FONT_VARS)) {
    const first = fam[k].split(',')[0].trim();
    fixed.push(`  --font-${k}: var(${v}, ${first}),${fam[k].slice(fam[k].indexOf(',') + 1)};`);
  }
  return (
    HEADER +
    `\n/* Hell (Standard) und explizit hell */\n:root,\n[data-theme='light'] {\n${themeBlock('light')}\n}\n` +
    `\n/* Dunkel, explizit gewählt (Cookie pf-theme) oder als Bereich */\n[data-theme='dark'] {\n${themeBlock('dark')}\n}\n` +
    `\n/* System: folgt dem Gerät, solange nichts gewählt ist */\n@media (prefers-color-scheme: dark) {\n  :root:not([data-theme]) {\n${themeBlock('dark').replace(/^/gm, '  ')}\n  }\n}\n` +
    `\n/* Maße, Radien, Ebenen, Breakpoints, Schriften */\n:root {\n${fixed.join('\n')}\n}\n`
  );
}

function typoUtility(style, family) {
  const decl = (s) =>
    [
      `font-size: ${s.fontSize};`,
      `line-height: ${s.lineHeight};`,
      s.fontWeight !== undefined ? `font-weight: ${s.fontWeight};` : null,
      s.letterSpacing ? `letter-spacing: ${s.letterSpacing};` : null,
    ].filter(Boolean);
  const out = [`@utility text-${style.name} {`, `  font-family: var(--font-${family});`];
  const m = MOBILE[style.name];
  if (m) {
    out.push(...decl({ ...style, ...m }).map((d) => `  ${d}`));
    out.push(`  @media (width >= ${lg}) {`, ...decl(style).map((d) => `    ${d}`), '  }');
  } else {
    out.push(...decl(style).map((d) => `  ${d}`));
    if (!style.letterSpacing) out.push('  letter-spacing: normal;');
  }
  if (style.name === 'overline') out.push('  text-transform: uppercase;');
  if (family === 'display' || style.name.startsWith('mono'))
    out.push('  font-variant-numeric: tabular-nums;');
  out.push('}');
  return out.join('\n');
}

const TYPE_STYLES = tokens.type.groups.flatMap((g) => g.styles.map((s) => s.name));

function themeCss() {
  const out = [HEADER];
  out.push(
    '/* Dunkel-Variante: explizit gewählt oder System-Dunkel ohne Wahl */',
    '@custom-variant dark {',
    "  &:where([data-theme='dark'], [data-theme='dark'] *) {",
    '    @slot;',
    '  }',
    '  @media (prefers-color-scheme: dark) {',
    '    &:where(:root:not([data-theme]) *) {',
    '      @slot;',
    '    }',
    '  }',
    '}',
    '',
    '/* Nur Token-Farben und Token-Schriftstile; Tailwinds Standardpalette und -größen sind abgeschaltet. */',
    '@theme {',
    '  --color-*: initial;',
    '  --text-*: initial;',
    ...tokens.breakpoint.tokens.map(
      (t) => `  --breakpoint-${t.name.replace('bp-', '')}: ${t.value};`,
    ),
    '  --breakpoint-2xl: initial;',
    ...tokens.radius.tokens.map((t) => `  --${t.name}: ${t.value};`),
    '  --radius-2xl: initial;',
    '  --radius-3xl: initial;',
    '  --radius-4xl: initial;',
    '}',
    '',
    '@theme inline {',
    ...colors.map((c) => `  --color-${c.name}: var(--${c.name});`),
    '  --color-transparent: transparent;',
    '  --color-current: currentColor;',
    '  --font-heading: var(--font-display);',
    '  --font-body: var(--font-text);',
    '  --font-sans: var(--font-text);',
    '  --font-data: var(--font-mono);',
    '}',
    '',
    '/* Schatten wechseln mit dem Theme, deshalb als Variable statt als Tailwind-Schattenwert */',
    ...shadows.map(
      (s) =>
        `@utility shadow-${s.name.replace('shadow-', '')} {\n  box-shadow: var(--${s.name});\n}`,
    ),
    '',
    ...tokens.zIndex.tokens.map((z) => `@utility ${z.name} {\n  z-index: var(--${z.name});\n}`),
    '',
    '/* Typografie (tokens.json type.groups): Familie, Größe, Zeilenhöhe, Gewicht, Laufweite */',
  );
  for (const g of tokens.type.groups) {
    const family = g.family === 'mono' ? 'mono' : g.family;
    for (const s of g.styles) out.push(typoUtility(s, family));
  }
  return out.join('\n') + '\n';
}

function designTokensTs() {
  const pick = (theme) => Object.fromEntries(colors.map((c) => [c.name, c.value[theme]]));
  return (
    '// Erzeugt von scripts/gen-theme.mjs aus docs/design-system/tokens.json. Nicht von Hand ändern.\n' +
    '/** Farbwerte des PROfessor Design Systems für Orte ohne CSS-Variablen (Manifest, E-Mail, PDF). */\n' +
    `export const DESIGN_COLORS = ${JSON.stringify({ light: pick('light'), dark: pick('dark') }, null, 2)} as const;\n\n` +
    `export type DesignColor = keyof (typeof DESIGN_COLORS)['light'];\n`
  );
}

function uiTokensTs() {
  return (
    '// Erzeugt von scripts/gen-theme.mjs aus docs/design-system/tokens.json. Nicht von Hand ändern.\n' +
    `/** Schriftstile des Design Systems (Utilities text-<name>). */\nexport const TYPE_STYLES = ${JSON.stringify(TYPE_STYLES)} as const;\n` +
    `export type TypeStyle = (typeof TYPE_STYLES)[number];\n`
  );
}

function bundleCss() {
  const css = readFileSync(join(src, 'bundle.css'), 'utf8');
  return (
    '/* Kopie von docs/design-system/bundle.css (scripts/gen-theme.mjs). Nicht von Hand ändern. */\n' +
    css
  );
}

const outputs = {
  'packages/ui/src/styles/tokens.css': tokensCss(),
  'packages/ui/src/styles/theme.css': themeCss(),
  'packages/ui/src/styles/bundle.css': bundleCss(),
  'packages/shared/src/design-tokens.ts': designTokensTs(),
  'packages/ui/src/tokens.generated.ts': uiTokensTs(),
};

const stale = [];
for (const [rel, content] of Object.entries(outputs)) {
  const file = join(root, rel);
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (current === content) continue;
  if (check) stale.push(rel);
  else {
    writeFileSync(file, content);
    console.log(`geschrieben: ${rel}`);
  }
}
if (check && stale.length) {
  console.error(`Nicht aktuell (pnpm design:gen ausführen):\n  ${stale.join('\n  ')}`);
  process.exit(1);
}
