// Service worker — cache offline simples (cache-first) para o app funcionar sem internet.
const CACHE = 'ponto-a-ponto-v16';
const ASSETS = [
  '.',
  'index.html',
  'css/styles.css',
  'js/i18n.js',
  'js/sound.js',
  'js/ads.js',
  'js/game.js',
  'js/online.js',
  'js/firebase-config.js',
  'js/ads-config.js',
  'js/vendor/firebase-app-compat.js',
  'js/vendor/firebase-auth-compat.js',
  'js/vendor/firebase-database-compat.js',
  'manifest.webmanifest',
  'icon.svg',
  'audio/music.m4a',
  'audio/flick.m4a',
  'audio/pop.m4a',
  'audio/bell.m4a',
  'audio/cheer.m4a',
  'audio/wah.m4a',
  'audio/roll.m4a',
  'audio/boing.m4a',
  'audio/bugle.m4a'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Nunca interceptar chamadas externas (Firebase etc.) — cacheá-las quebraria o modo online.
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
