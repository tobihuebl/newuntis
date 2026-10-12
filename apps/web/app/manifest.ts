import type { MetadataRoute } from 'next';

/** Web-App-Manifest (PWA): installierbar, Start auf "Heute". */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Schulplattform',
    short_name: 'Schule',
    description: 'Stundenplan, Klassenbuch und Kommunikation der Schule',
    lang: 'de-AT',
    start_url: '/heute',
    scope: '/',
    display: 'standalone',
    background_color: '#FAFAF9',
    theme_color: '#4F46E5',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
