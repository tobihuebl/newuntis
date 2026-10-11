import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@sp/ui', '@sp/shared'],
  poweredByHeader: false,
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
    ];
  },
};

export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);
