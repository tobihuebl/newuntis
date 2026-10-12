import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

// .env liegt im Repository-Stamm
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url).pathname);
} catch {
  // keine .env: Variablen kommen aus der Umgebung
}

const nextConfig: NextConfig = {
  transpilePackages: ['@sp/ui', '@sp/shared'],
  // E2E-Tests bauen in ein eigenes Verzeichnis, damit ein laufendes `pnpm dev` unberührt bleibt
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  // Docker-Image (infra/Dockerfile): eigenständiger Server mit den nötigen Abhängigkeiten aus dem Monorepo
  ...(process.env.NEXT_STANDALONE === '1'
    ? {
        output: 'standalone' as const,
        outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
      }
    : {}),
  // Browser sprechen nur mit der Web-App (gleicher Origin); die API ist nicht öffentlich erreichbar.
  async rewrites() {
    const api = process.env.API_URL ?? 'http://localhost:4000';
    return [{ source: '/api/v1/:path*', destination: `${api}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        // Content-Security-Policy mit Nonce setzt proxy.ts; hier die übrigen Sicherheits-Header
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
          },
          // Nur über HTTPS wirksam (Browser ignorieren HSTS bei HTTP); lokal ohne Wirkung
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
            : []),
        ],
      },
      {
        // Neue Versionen des Service Workers sofort erkennen
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
};

export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);
