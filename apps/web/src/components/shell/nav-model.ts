import type { NavItem, NavSection } from '@sp/shared';

/** Längster passender Eintrag gewinnt ("/admin" ist nur auf der Übersicht aktiv, nicht auf allen Admin-Seiten). */
export function activeHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const h of hrefs) {
    const match = pathname === h || pathname.startsWith(`${h}/`);
    if (match && (!best || h.length > best.length)) best = h;
  }
  return best;
}

/** Alle Ziele der Navigation einer Ansicht, ohne Doppelte (für Befehlspalette und Kopfzeilen-Titel). */
export function allItems(tabs: NavItem[], sections: NavSection[]): NavItem[] {
  const seen = new Map<string, NavItem>();
  for (const i of [...sections.flatMap((s) => s.items), ...tabs]) {
    if (i.href !== '/mehr' && !seen.has(i.href)) seen.set(i.href, i);
  }
  return [...seen.values()];
}

/** Suche ohne Groß-/Kleinschreibung und Umlaut-Unterschiede (ä = ae). */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
