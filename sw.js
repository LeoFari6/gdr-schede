// Service worker: rende l'app utilizzabile offline.
// Strategia "network first" per avere sempre l'ultima versione quando c'è
// connessione, con ripiego sulla cache quando si è offline.
const CACHE = 'gdr-schede-v71';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/app.js', './js/ui.js', './js/store.js', './js/theme.js', './js/formula.js',
  './js/engine.js', './js/systems.js', './js/sheet-render.js', './js/richtext.js', './js/spells.js', './js/images.js', './js/tables.js', './js/i18n.js', './js/i18n-en.js', './js/cropper.js', './js/audio-trim.js', './js/levelup.js', './js/rest.js',
  './js/views/home.js', './js/views/sheet.js', './js/views/spell-list.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    // no-cache: chiede sempre al server se il file è cambiato (evita versioni vecchie dalla cache HTTP)
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
