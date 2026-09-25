// Service worker de Lagrobarber : il tourne en arrière-plan, même quand l'app est fermée.
// Rôles : afficher les notifications push, et une page de secours quand il n'y a pas de réseau.

const CACHE = 'lagrobarber-v2';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([OFFLINE_URL, '/icons/icon-192.png'])));
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Les créneaux doivent toujours être à jour : on ne met rien en cache,
// on affiche seulement la page hors connexion si le réseau est coupé.
self.addEventListener('fetch', event => {
    if (event.request.mode !== 'navigate') return;
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});

self.addEventListener('push', event => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = { body: event.data && event.data.text() };
    }
    event.waitUntil(
        self.registration.showNotification(data.title || 'Lagrobarber', {
            body: data.body || '',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            data: { url: data.url || '/' },
        })
    );
});

// Un appui sur la notification ouvre l'app sur la bonne page (ou réutilise la fenêtre déjà ouverte)
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
            const existing = windows.find(w => w.url.startsWith(self.location.origin));
            if (existing) return existing.navigate(url).then(w => (w || existing).focus());
            return self.clients.openWindow(url);
        })
    );
});
