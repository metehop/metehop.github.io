// Metehop — Service Worker
// v152 - 26/09/2026 : passage à un cache VERSIONNÉ + prise de contrôle immédiate, pour que
// les mises à jour de l'app s'appliquent en UN SEUL rechargement (auto, voir index.html) au
// lieu d'exiger plusieurs rechargements manuels (ancien bug : sans skipWaiting()/clients.claim(),
// le nouveau SW reste en attente ("waiting") tant qu'un onglet garde l'ancien ouvert, et l'app
// shell + les données affichées restent celles de l'ancienne version jusqu'à ce que TOUS les
// onglets soient fermés puis rouverts).
//
// IMPORTANT : incrémente CACHE_VERSION à chaque déploiement (ou automatise-le dans ton build).
// C'est ce numéro qui déclenche la détection de mise à jour côté navigateur.
const CACHE_VERSION = 'metehop-v152';

const APP_SHELL = [
    './',
    './index.html',
    './about.html',
    './manifest.webmanifest',
    './favicon-512.png',
    './apple-touch-icon-180.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting()) // n'attend pas que les anciens onglets se ferment
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim()) // prend le contrôle des onglets déjà ouverts, sans attendre un reload
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // App shell (HTML/CSS/JS/icônes du même domaine) : NETWORK-FIRST avec repli cache.
    // Priorité au réseau pour toujours servir le code le plus récent quand la connexion est
    // bonne ; le cache ne sert que hors-ligne ou en cas d'échec réseau.
    if (url.origin === self.location.origin) {
        event.respondWith(
            fetch(event.request)
                .then((res) => {
                    const resClone = res.clone();
                    caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, resClone));
                    return res;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Tout le reste (API météo, tuiles radar, CDN Chart.js/Leaflet...) : NETWORK-ONLY.
    // Ces données ne doivent JAMAIS être servies depuis un cache obsolète — c'est déjà le
    // principe appliqué ailleurs dans l'app (fetchWithTimeout côté JS), on le confirme ici.
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});

// Permet à la page de demander l'activation immédiate du SW en attente (voir index.html).
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
