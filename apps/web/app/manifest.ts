import type { MetadataRoute } from 'next';
import { BRAND, DESIGN_COLORS } from '@sp/shared';

/** Web-App-Manifest (PWA, Design System "Web und Mobile" Abschnitt 4): installierbar, Start auf "Heute". */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.description,
    lang: 'de-AT',
    start_url: '/heute',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: DESIGN_COLORS.light.nacht,
    theme_color: DESIGN_COLORS.light.nacht,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      {
        src: '/icons/monochrome-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'monochrome',
      },
    ],
  };
}
