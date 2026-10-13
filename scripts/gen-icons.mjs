#!/usr/bin/env node
/**
 * PWA-Icons aus dem Logo des Design Systems (packages/ui/assets/logo, CI-Handbuch Abschnitt 3):
 *   icon-192/512 und apple-touch-icon (180, ohne Transparenz) aus app-icon-1024.svg,
 *   maskable-512 (Symbol liegt schon innerhalb der inneren 80 %), monochrome-512 (Symbol einfarbig,
 *   Amber-Kachel als Aussparung), favicon-32 (nur Symbol, Kobalt mit Amber-Kachel).
 * Aufruf: pnpm design:icons
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logo = join(root, 'packages/ui/assets/logo');
const out = join(root, 'apps/web/public/icons');
mkdirSync(out, { recursive: true });

const appIcon = readFileSync(join(logo, 'app-icon-1024.svg'));
const symbolKobalt = readFileSync(join(logo, 'symbol-kobalt.svg'), 'utf8');

/** Monochrom: alle Kacheln des Symbols außer der Amber-Kachel, auf transparentem Grund (Maße wie app-icon-1024). */
function monochrome() {
  const icon = readFileSync(join(logo, 'app-icon-1024.svg'), 'utf8');
  const tiles = [...icon.matchAll(/<rect x="[^"]+"[^>]*fill="(#[0-9a-f]+)"[^>]*>/gi)]
    .filter((m) => m[1].toLowerCase() !== '#f3a423')
    .map((m) => m[0].replace(/fill="#[0-9a-f]+"/i, 'fill="#ffffff"').replace(/>$/, '/>'))
    .join('');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${tiles}</svg>`,
  );
}

/** Favicon: Symbol (332 × 564) mittig mit etwas Rand auf transparentem Quadrat. */
function favicon() {
  const inner = symbolKobalt.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-152 -20 636 604">${inner}</svg>`,
  );
}

const jobs = [
  ['icon-192.png', appIcon, 192],
  ['icon-512.png', appIcon, 512],
  ['maskable-512.png', appIcon, 512],
  ['apple-touch-icon.png', appIcon, 180],
  ['monochrome-512.png', monochrome(), 512],
  ['favicon-32.png', favicon(), 32],
];
for (const [name, svg, size] of jobs) {
  let img = sharp(svg, { density: 300 }).resize(size, size);
  if (name === 'apple-touch-icon.png') img = img.flatten();
  await img.png().toFile(join(out, name));
  console.log(`geschrieben: apps/web/public/icons/${name}`);
}
