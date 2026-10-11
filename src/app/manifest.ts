import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kanawita (كنويطة) — TND Personal Finance & Friend Influence',
    short_name: 'Kanawita',
    description:
      'Frictionless 2-second TND micro-spending logger, unified UIB/Savings/D17 balance pool, and hybrid Friend Influence tracker.',
    start_url: '/',
    display: 'standalone',
    background_color: '#08090C',
    theme_color: '#08090C',
    orientation: 'portrait',
    icons: [
      {
        src: '/icons/icon-192.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
