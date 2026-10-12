import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, createNonce } from './src/lib/csp';

/**
 * Setzt pro Anfrage eine Content-Security-Policy mit Nonce. Next übernimmt die Nonce aus dem Request-Header
 * für seine eigenen Inline-Skripte; alle Seiten werden ohnehin dynamisch gerendert (Sitzung, Farbschema).
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp(nonce, {
    dev: process.env.NODE_ENV !== 'production',
    https:
      request.headers.get('x-forwarded-proto') === 'https' || request.nextUrl.protocol === 'https:',
  });
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // API (Proxy zur API mit eigenen Headern), statische Dateien und Service Worker ausgenommen
      source:
        '/((?!api/|_next/static|_next/image|icons/|sw\\.js|manifest\\.webmanifest|favicon).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
