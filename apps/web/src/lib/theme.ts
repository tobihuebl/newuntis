import { DESIGN_COLORS } from '@sp/shared';

/**
 * Theme-Wahl (Design System "Web und Mobile" Abschnitt 5): System (Standard), Hell, Dunkel.
 * Gespeichert im Cookie pf-theme, damit der Server data-theme schon beim ersten Rendern setzt (kein Aufblitzen,
 * kein Inline-Skript wegen der Content-Security-Policy). "System" folgt prefers-color-scheme in tokens.css.
 */
export type Theme = 'system' | 'light' | 'dark';
export const THEME_COOKIE = 'pf-theme';

export function parseTheme(value: string | undefined): Theme {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** Farbe der Statusleiste je Theme (Creme hell, Nacht dunkel). */
export const THEME_COLOR = { light: DESIGN_COLORS.light.bg, dark: DESIGN_COLORS.dark.bg } as const;

/** Clientseitig: Cookie schreiben, data-theme und theme-color sofort anpassen. */
export function applyTheme(theme: Theme): void {
  // Ein Jahr, nur für diese Schule (Subdomain), ohne personenbezogene Daten
  document.cookie =
    theme === 'system'
      ? `${THEME_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`
      : `${THEME_COOKIE}=${theme}; Max-Age=31536000; Path=/; SameSite=Lax`;
  const html = document.documentElement;
  if (theme === 'system') delete html.dataset.theme;
  else html.dataset.theme = theme;
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    m.content = dark ? THEME_COLOR.dark : THEME_COLOR.light;
    m.removeAttribute('media');
  }
}

export function readTheme(): Theme {
  const m = new RegExp(`(?:^|; )${THEME_COOKIE}=(light|dark)`).exec(document.cookie);
  return parseTheme(m?.[1]);
}
