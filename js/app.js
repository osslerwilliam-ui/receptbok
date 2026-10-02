// Startpunkt: öppnar databasen, kör ev. migreringar, startar navigeringen och service workern.

import * as db from './db.js';
import { SCHEMA_VERSION, migrateData } from './migrate.js';
import { setAll, meta, onSaveError } from './store.js';
import { start, navigate, transition } from './router.js';
import { snack, esc } from './ui.js';
import { isoDay } from './format.js';
import * as home from './views/home.js';

const views = {
  home: () => Promise.resolve(home),
  chapter: () => import('./views/chapter.js'),
  recipe: () => import('./views/recipe.js'),
  cook: () => import('./views/recipe.js'),
  edit: () => import('./views/edit.js'),
  fix: () => import('./views/edit.js'),
  history: () => import('./views/history.js'),
  version: () => import('./views/history.js'),
  compare: () => import('./views/history.js'),
  settings: () => import('./views/settings.js'),
};

const app = document.getElementById('app');
let cleanup = null;
let navToken = 0;
let prevRoute = null;

function runCleanup() {
  try { cleanup?.(); } catch (err) { console.error(err); }
  cleanup = null;
}

async function onRoute(route, ctx) {
  const token = ++navToken;
  const mod = await views[route.name]();
  if (token !== navToken) return;
  transition(() => {
    runCleanup();
    const view = document.createElement('div');
    view.className = `view view-${route.name}`;
    const r = mod.render(view, route.params, { ...ctx, prev: prevRoute }, { cook: route.name === 'cook', fix: route.name === 'fix', view: route.name });
    prevRoute = route;
    cleanup = typeof r === 'function' ? r : null;
    app.replaceChildren(view);
    window.scrollTo(0, ctx.scrollY);
  }, ctx.direction);
}

// Interna länkar (<a data-link>) navigerar utan att ladda om sidan.
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  navigate(a.getAttribute('href').replace(/^#/, ''));
});

async function loadData() {
  let data = await db.readAll();
  let v = await db.getMeta('schemaVersion');
  const hasData = Object.values(data).some(list => list.length);
  if (v == null) {
    v = hasData ? 1 : SCHEMA_VERSION;
    await db.setMeta('schemaVersion', v);
  }
  if (v < SCHEMA_VERSION) {
    // Datamodellen har ändrats: spara backup först, sedan migrera.
    const { buildBackup, downloadJSON } = await import('./backup.js');
    const backup = buildBackup(data, v);
    await db.setMeta('preMigrationBackup', backup);
    downloadJSON(backup, `receptbok-backup-fore-uppdatering-${isoDay()}.json`);
    data = migrateData(data, v);
    await db.replaceAll(data);
    await db.setMeta('schemaVersion', SCHEMA_VERSION);
    setTimeout(() => snack('Appen har uppdaterats. En backup av dina recept sparades först i Hämtade filer.', { duration: 8000 }), 500);
  }
  meta.lastExportAt = await db.getMeta('lastExportAt');
  return data;
}

async function boot() {
  navigator.storage?.persist?.().catch(() => {});
  let data;
  try {
    data = await loadData();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="page"><div class="empty"><div class="big">Receptboken kunde inte öppnas</div>
      <p>Webbläsaren gav inte appen tillgång till sin lagring. Stäng appen helt och öppna den igen.</p>
      <p class="muted">${esc(err?.message || '')}</p></div></div>`;
    return;
  }
  setAll(data);
  onSaveError(() => snack('Kunde inte spara ändringen. Försök igen.', { duration: 7000 }));
  start(onRoute);
  registerServiceWorker();

  // Förladda övriga vyer när appen är ledig, så att de öppnas direkt.
  const preload = () => {
    // Städa bort foton från testloggar som tagits bort.
    db.deleteOrphanPhotos(new Set(data.testlogs.map(l => l.id))).catch(() => {});
    ['chapter', 'recipe', 'edit', 'settings', 'history'].forEach(n => views[n]().catch(() => {}));
    import('./search.js').then(m => m.search('')); // bygger sökindexet i förväg
  };
  if ('requestIdleCallback' in window) requestIdleCallback(preload, { timeout: 2000 });
  else setTimeout(preload, 800);
}

/* ---------- Service worker och "Ny version finns" ---------- */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let userAsked = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (userAsked) location.reload();
  });
  const showUpdate = worker => {
    if (document.getElementById('update-banner')) return;
    const el = document.createElement('div');
    el.id = 'update-banner';
    el.className = 'update-banner';
    el.setAttribute('role', 'status');
    el.innerHTML = '<span>Ny version finns</span><button type="button">Ladda om</button>';
    el.querySelector('button').onclick = () => {
      runCleanup(); // spara pågående redigering
      userAsked = true;
      worker.postMessage('skipWaiting');
      setTimeout(() => location.reload(), 3000);
    };
    document.body.append(el);
  };
  navigator.serviceWorker.register('sw.js').then(reg => {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w);
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(err => console.warn('Service worker kunde inte registreras', err));
}

boot();
