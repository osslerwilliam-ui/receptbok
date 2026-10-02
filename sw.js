// Service worker: gör att appen fungerar offline.
// HÖJ VERSIONEN vid varje release, annars når uppdateringen inte telefonen.
const VERSION = '1.0.0';
const CACHE = `receptbok-v${VERSION}`;

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/app.css',
  'js/app.js',
  'js/backup.js',
  'js/components.js',
  'js/db.js',
  'js/format.js',
  'js/icons.js',
  'js/migrate.js',
  'js/router.js',
  'js/search.js',
  'js/share.js',
  'js/store.js',
  'js/ui.js',
  'js/wakelock.js',
  'js/views/home.js',
  'js/views/chapter.js',
  'js/views/recipe.js',
  'js/views/edit.js',
  'js/views/settings.js',
  'fonts/fraunces-latin-wght-normal.woff2',
  'fonts/fraunces-latin-wght-italic.woff2',
  'fonts/inter-latin-wght-normal.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon.png',
];

self.addEventListener('install', event => {
  // cache: 'reload' hämtar färska filer förbi webbläsarens HTTP-cache.
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('receptbok-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') {
      return (await cache.match('index.html')) || fetch(req);
    }
    return (await cache.match(req, { ignoreSearch: true })) || fetch(req);
  })());
});
