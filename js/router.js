// Navigering med History API och #-adresser (fungerar på GitHub Pages och med Androids bakåtknapp).

import { consumeSheetPop, closingByBack, afterSheetBack, reducedMotion } from './ui.js';

const ROUTES = [
  [/^\/$/, 'home'],
  [/^\/kapitel\/([^/]+)$/, 'chapter'],
  [/^\/recept\/([^/]+)$/, 'recipe'],
  [/^\/recept\/([^/]+)\/kok$/, 'cook'],
  [/^\/recept\/([^/]+)\/redigera$/, 'edit'],
  [/^\/installningar$/, 'settings'],
];

let handler = () => {};
const scrollPos = new Map();

export function currentPath() {
  return decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
}

export function match(path) {
  for (const [re, name] of ROUTES) {
    const m = path.match(re);
    if (m) return { name, params: m.slice(1) };
  }
  return { name: 'home', params: [] };
}

export function start(onRoute) {
  handler = onRoute;
  if (!history.state || history.state.depth == null) history.replaceState({ depth: 0 }, '', location.hash || '#/');
  window.addEventListener('popstate', () => {
    if (consumeSheetPop()) return;   // ett ark stängdes med knapp
    if (closingByBack()) return;     // bakåtknappen stängde ett ark
    if (history.state?.sheet) { history.back(); return; } // gammalt arktillstånd: hoppa förbi
    render('back');
  });
  render('init');
}

function render(direction) {
  const path = currentPath();
  handler(match(path), { direction, path, scrollY: direction === 'back' ? scrollPos.get(path) || 0 : 0 });
}

export async function navigate(path, { replace = false } = {}) {
  await afterSheetBack();
  scrollPos.set(currentPath(), window.scrollY);
  const depth = (history.state?.depth || 0) + (replace ? 0 : 1);
  history[replace ? 'replaceState' : 'pushState']({ depth, from: replace ? history.state?.from : currentPath() }, '', '#' + path);
  render(replace ? 'replace' : 'forward');
}

/** Bakåt inom appen, eller till startsidan om man kom in direkt via en länk. */
export async function back(fallback = '/') {
  await afterSheetBack();
  if ((history.state?.depth || 0) > 0) history.back();
  else navigate(fallback, { replace: true });
}

/** Byter innehåll med en mjuk övergång (View Transitions där det stöds). */
export function transition(update, direction) {
  const animate = document.startViewTransition && !reducedMotion() && direction !== 'init' && direction !== 'replace';
  if (!animate) { update(); return; }
  document.documentElement.dataset.nav = direction;
  document.startViewTransition(update);
}
