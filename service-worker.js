// Service worker Metehop (chantier 3, 12/09/2026) — hors-ligne de plus en plus complet :
// - App shell (index.html, about.html, manifest, icônes, og-image) mis en cache à l'installation.
// - Bibliothèques CDN (Chart.js, SunCalc, Leaflet) : cache-first puis actualisation en arrière-plan.
// - Données (météo Open-Meteo, radar, hydrologie, webcams…) : réseau EN PRIORITÉ — jamais de
//   donnée périmée tant qu'on est connecté — avec repli sur la dernière version vue si hors-ligne.
// Incrémenter le nom du cache à chaque nouvelle version du contenu (PWA version v1, footer 110).
const CACHE = 'metehop-v1';

const APP_SHELL = [
    './',
    './index.html',
    './about.html',
    './manifest.webmanifest',
    './favicon-16.png',
    './favicon-32.png',
    './favicon-512.png',
    './apple-touch-icon-180.png',
    './og-image.png'
];

// Origins CDN dont les fichiers statiques sont sûrs à servir depuis le cache en priorité.
const CDN_ORIGINS = [
    'https://cdn.jsdelivr.net',
    'https://cdnjs.cloudflare.com',
    'https://unpkg.com'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE)
            .then(c => c.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
            .catch(() => {})
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

async function cacheFirst(req) {
    const hit = await caches.match(req);
    if (hit) {
        // actualise en arrière-plan sans bloquer la réponse
        fetch(req).then(r => {
            if (r && r.ok) caches.open(CACHE).then(c => c.put(req, r));
        }).catch(() => {});
        return hit;
    }
    const r = await fetch(req);
    if (r && r.ok && (r.type === 'basic' || r.type === 'cors')) {
        const cache = await caches.open(CACHE);
        cache.put(req, r.clone());
    }
    return r;
}

async function networkFirst(req) {
    try {
        const r = await fetch(req);
        if (r && r.ok && (r.type === 'basic' || r.type === 'cors')) {
            const cache = await caches.open(CACHE);
            cache.put(req, r.clone());
        }
        return r;
    } catch (e) {
        const hit = await caches.match(req);
        if (hit) return hit;
        throw e;
    }
}

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    // Navigation : l'app shell sert toujours la page (repli hors-ligne sur index.html).
    if (req.mode === 'navigate') {
        e.respondWith(
            fetch(req).then(r => {
                if (r && r.ok && (r.type === 'basic' || r.type === 'cors')) {
                    const cache = caches.open(CACHE).then(c => c.put(req, r.clone()));
                }
                return r;
            }).catch(() => caches.match('./index.html').then(h => h || caches.match('./')))
        );
        return;
    }

    // Fichiers locaux (même origine) : cache d'abord.
    if (url.origin === self.location.origin && /\.(html|css|js|json|png|webmanifest|svg|ico)$/.test(url.pathname)) {
        e.respondWith(cacheFirst(req));
        return;
    }

    // Bibliothèques CDN : cache d'abord.
    if (CDN_ORIGINS.some(o => url.origin === o)) {
        e.respondWith(cacheFirst(req));
        return;
    }

    // Tout le reste (APIs météo, radar, hydrologie…) : réseau d'abord, repli cache si hors-ligne.
    e.respondWith(networkFirst(req));
});