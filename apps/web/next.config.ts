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
  // Browser sprechen nur mit der Web-App (gleicher Origin); die API ist nicht öffentlich erreichbar.
  async rewrites() {
    const api = process.env.API_URL ?? 'http://localhost:4000';
    return [{ source: '/api/v1/:path*', destination: `${api}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
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
