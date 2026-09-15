/* TV Neerstedt Spielstatistik – Service Worker
   Cached die komplette App beim ersten Aufruf, damit sie danach ohne
   Internetverbindung/WLAN vollständig nutzbar ist. Die Spieldaten selbst
   liegen NICHT hier, sondern entweder in IndexedDB oder – falls eingerichtet –
   in Firebase Firestore mit lokalem Offline-Cache (siehe app.js). */

const CACHE_VERSION = 'v2';
const CACHE_NAME = 'tvn-stats-' + CACHE_VERSION;

const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './lib/xlsx.full.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

// Firebase-Bibliothek für Cloud-Synchronisation (nur relevant, wenn in app.js
// eingerichtet). Best-effort cachen: falls beim allerersten Laden keine
// Internetverbindung besteht, darf das die restliche App-Installation nicht
// verhindern (siehe unten – kein cache.addAll für diese Liste).
const OPTIONAL_SHELL = [
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        // Kern-App-Shell: muss vollständig gecacht werden, damit die App
        // offline funktioniert. Diese Dateien liegen alle beim Server der
        // App selbst und sind beim Laden der Seite bereits erreichbar.
        await cache.addAll(APP_SHELL);
        // Firebase-Skripte: bestes Bemühen, einzeln statt über addAll, damit
        // ein einzelner nicht erreichbarer Eintrag nicht die gesamte
        // Installation (und damit die Offline-Fähigkeit der App) verhindert.
        await Promise.all(OPTIONAL_SHELL.map((url) =>
          fetch(url).then((res) => {
            if(res && res.ok) return cache.put(url, res);
          }).catch(() => { /* z.B. kein Internet beim ersten Start: ignorieren */ })
        ));
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok && event.request.url.startsWith(self.location.origin)) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached || caches.match('./index.html'));
      return cached || network;
    })
  );
});
