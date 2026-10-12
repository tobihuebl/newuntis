/**
 * Content-Security-Policy ohne Fremdquellen (Spec Abschnitt 13, Web-Härtung). Skripte nur mit Nonce pro Anfrage
 * ('strict-dynamic' für von Next nachgeladene Teile), keine Inline-Ereignisse, keine Einbettung in fremde Seiten.
 * Inline-Styles bleiben erlaubt (React style-Attribute, z. B. Fortschrittsbalken); sie führen keinen Code aus.
 */
export function buildCsp(nonce: string, opts: { dev: boolean; https: boolean }): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // Echtzeit (SSE) und API laufen über denselben Origin; im Entwicklungsmodus zusätzlich Hot Reload
    `connect-src 'self'${opts.dev ? ' ws: wss:' : ''}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(opts.https ? ['upgrade-insecure-requests'] : []),
  ];
  return directives.join('; ');
}

/** Zufällige Nonce (Base64, 128 Bit) für eine Antwort. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
