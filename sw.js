// Service worker: gör att appen fungerar offline.
// HÖJ VERSIONEN vid varje release, annars når uppdateringen inte telefonen.
const VERSION = '1.12.1';
const CACHE = `receptbok-v${VERSION}`;

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/app.css',
  'css/themes.css',
  'js/app.js',
  'js/backup.js',
  'js/components.js',
  'js/db.js',
  'js/diff.js',
  'js/format.js',
  'js/icons.js',
  'js/gridsort.js',
  'js/migrate.js',
  'js/photos.js',
  'js/recipe-parts.js',
  'js/router.js',
  'js/search.js',
  'js/share.js',
  'js/tolist.js',
  'js/store.js',
  'js/theme.js',
  'js/dragsort.js',
  'js/ui.js',
  'js/wakelock.js',
  'js/views/home.js',
  'js/views/chapter.js',
  'js/views/recipe.js',
  'js/views/edit.js',
  'js/views/settings.js',
  'js/views/history.js',
  'js/views/lists.js',
  'js/views/listedit.js',
  'fonts/fraunces-latin-wght-normal.woff2',
  'fonts/fraunces-latin-wght-italic.woff2',
  'fonts/inter-latin-wght-normal.woff2',
  'fonts/cormorant-garamond-latin-600-normal.woff2',
  'fonts/cormorant-garamond-latin-600-italic.woff2',
  'fonts/cormorant-garamond-latin-700-normal.woff2',
  'fonts/cormorant-garamond-latin-700-italic.woff2',
  'fonts/nunito-latin-wght-normal.woff2',
  'fonts/ibm-plex-serif-latin-400-normal.woff2',
  'fonts/ibm-plex-serif-latin-600-normal.woff2',
  'fonts/ibm-plex-serif-latin-400-italic.woff2',
  'fonts/ibm-plex-sans-latin-400-normal.woff2',
  'fonts/ibm-plex-sans-latin-600-normal.woff2',
  'fonts/ibm-plex-mono-latin-400-normal.woff2',
  'fonts/ibm-plex-mono-latin-500-normal.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon.png',
];

self.addEventListener('install', event => {
  // Varje fil hämtas med ?v=VERSION så att GitHub Pages inte kan svara med en gammal kopia
  // precis efter en publicering (då kan gamla och nya filer annars blandas och appen gå sönder).
  // Sparas utan ?v= så att appens vanliga adresser hittas.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(FILES.map(async f => {
      const res = await fetch(new Request(`${f}${f.includes('?') ? '&' : '?'}v=${VERSION}`, { cache: 'reload' }));
      if (!res.ok) throw new Error(`Kunde inte hämta ${f}: ${res.status}`);
      await cache.put(f, res);
    }));
  })());
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
