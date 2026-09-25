import type { MetadataRoute } from 'next';

// Manifeste de l'application : c'est lui qui rend le site installable sur l'écran d'accueil
export default function manifest(): MetadataRoute.Manifest {
    return {
        id: '/',
        name: 'Lagrobarber · Prendre rendez-vous',
        short_name: 'Lagrobarber',
        description: 'Réserve ta coupe en quelques secondes, confirmation immédiate.',
        lang: 'fr',
        start_url: '/?source=app',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#efe3cc',
        theme_color: '#efe3cc',
        categories: ['lifestyle', 'business'],
        icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
            { name: 'Mes rendez-vous', url: '/mes-rdv', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
            { name: 'Espace coiffeur', url: '/admin', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        ],
    };
}
