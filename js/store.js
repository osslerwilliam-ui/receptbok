// All data hålls i minnet medan appen körs (snabbt) och skrivs till IndexedDB vid varje ändring.

import * as db from './db.js';
import { STORES } from './db.js';

export const state = {
  chapters: new Map(),
  recipes: new Map(),
  variants: new Map(),
  versions: new Map(),
  testlogs: new Map(),
  lists: new Map(),
};

// Inställningar och annat från meta-tabellen (t.ex. lastExportAt), laddas vid start.
export const meta = {};

// Ökar vid varje ändring som påverkar sökning och listor.
export let rev = 0;
const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

let errorHandler = () => {};
export function onSaveError(fn) { errorHandler = fn; }

const now = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();

export const NO_CHAPTER = 'utan-kapitel';

export const CHAPTER_COLORS = ['terrakotta', 'oliv', 'senap', 'plommon', 'skog', 'lera'];

export function setAll(data) {
  for (const name of STORES) {
    state[name] = new Map((data[name] || []).map(o => [o.id, o]));
  }
  bump();
}

export function snapshot() {
  const out = {};
  for (const name of STORES) out[name] = [...state[name].values()];
  return out;
}

function bump() {
  rev++;
  for (const fn of listeners) fn();
}

// Uppdaterar minnet direkt och sparar i bakgrunden.
function commit(ops) {
  for (const op of ops) {
    if (op.put) state[op.store].set(op.put.id, op.put);
    else state[op.store].delete(op.del);
  }
  bump();
  return db.write(ops).catch(err => { console.error(err); errorHandler(err); });
}

/* ---------- Kapitel ---------- */

export function chaptersSorted() {
  return [...state.chapters.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'sv'));
}

export function createChapter({ name, emoji = '', color }) {
  const list = chaptersSorted();
  const t = now();
  const ch = {
    id: uuid(), name: name.trim() || 'Nytt kapitel', emoji, color: color || CHAPTER_COLORS[list.length % CHAPTER_COLORS.length], groups: [],
    sortOrder: list.length ? list[list.length - 1].sortOrder + 1 : 0, createdAt: t, updatedAt: t,
  };
  commit([{ store: 'chapters', put: ch }]);
  return ch;
}

export function updateChapter(id, patch) {
  const ch = state.chapters.get(id);
  if (!ch) return;
  commit([{ store: 'chapters', put: { ...ch, ...patch, updatedAt: now() } }]);
}

export function reorderChapters(ids) {
  const t = now();
  commit(ids.map((id, i) => ({ store: 'chapters', put: { ...state.chapters.get(id), sortOrder: i, updatedAt: t } })));
}

/** Tar bort ett kapitel. Recept i det flyttas till `moveTo` (ett kapitel-id eller null). */
export function deleteChapter(id, moveTo = null) {
  const t = now();
  const ops = recipesInChapter(id).map(r => ({ store: 'recipes', put: { ...r, chapterId: moveTo, groupId: null, updatedAt: t } }));
  ops.push({ store: 'chapters', del: id });
  commit(ops);
}

/* ---------- Grupper i kapitel ---------- */
// Ett kapitel kan ha grupper (t.ex. "Surdeg" i "Bröd"). De ligger i ordning i chapter.groups
// som { id, name, collapsed }. Ett recept hör till en grupp via recipe.groupId.

export function groupsOf(chapterId) {
  return state.chapters.get(chapterId)?.groups || [];
}

/** Receptets grupp, om den finns i receptets kapitel. */
export function groupOf(r) {
  if (!r.groupId) return null;
  return chapterOf(r)?.groups?.find(g => g.id === r.groupId) || null;
}

function putGroups(chapterId, groups) {
  const ch = state.chapters.get(chapterId);
  if (!ch) return;
  commit([{ store: 'chapters', put: { ...ch, groups, updatedAt: now() } }]);
}

export function createGroup(chapterId, name) {
  const g = { id: uuid(), name: name.trim() || 'Ny grupp', collapsed: false };
  putGroups(chapterId, [...groupsOf(chapterId), g]);
  return g;
}

export function updateGroup(chapterId, groupId, patch) {
  putGroups(chapterId, groupsOf(chapterId).map(g => (g.id === groupId ? { ...g, ...patch } : g)));
}

export function reorderGroups(chapterId, ids) {
  const byId = new Map(groupsOf(chapterId).map(g => [g.id, g]));
  putGroups(chapterId, [...ids.map(id => byId.get(id)).filter(Boolean), ...[...byId.values()].filter(g => !ids.includes(g.id))]);
}

/** Tar bort en grupp. Recepten blir kvar i kapitlet, utan grupp. Returnerar det som behövs för att ångra. */
export function deleteGroup(chapterId, groupId) {
  const ch = state.chapters.get(chapterId);
  if (!ch) return null;
  const recipes = [...state.recipes.values()].filter(r => r.chapterId === chapterId && r.groupId === groupId);
  const t = now();
  commit([
    { store: 'chapters', put: { ...ch, groups: groupsOf(chapterId).filter(g => g.id !== groupId), updatedAt: t } },
    ...recipes.map(r => ({ store: 'recipes', put: { ...r, groupId: null, updatedAt: t } })),
  ]);
  return { chapters: [ch], recipes };
}

/* ---------- Recept ---------- */

export function recipesInChapter(chapterId) {
  const want = chapterId === NO_CHAPTER ? null : chapterId;
  return [...state.recipes.values()]
    .filter(r => (r.chapterId && state.chapters.has(r.chapterId) ? r.chapterId : null) === want)
    .sort((a, b) => displayTitle(a).localeCompare(displayTitle(b), 'sv'));
}

export function displayTitle(r) { return (r.title || '').trim() || 'Namnlöst recept'; }

export function chapterOf(r) { return r.chapterId ? state.chapters.get(r.chapterId) || null : null; }

export function variantsOf(recipeId) {
  return [...state.variants.values()].filter(v => v.recipeId === recipeId).sort((a, b) => a.sortOrder - b.sortOrder);
}

/* Vald variant per recept medan man är inne i receptet (sparas inte). */
const selected = new Map();
export function selectVariant(recipeId, variantId) { selected.set(recipeId, variantId); }
export function clearVariantSelection(recipeId) { selected.delete(recipeId); }

/** Receptet med vald variant (annars standardvarianten) och dess aktuella version. */
export function bundle(recipeId, variantId = null) {
  const recipe = state.recipes.get(recipeId);
  if (!recipe) return null;
  const variants = variantsOf(recipeId);
  const wanted = variantId || selected.get(recipeId);
  const variant = (wanted && state.variants.get(wanted)?.recipeId === recipeId && state.variants.get(wanted))
    || state.variants.get(recipe.defaultVariantId) || variants[0];
  const version = variant && state.versions.get(variant.currentVersionId);
  if (!variant || !version) return null;
  return { recipe, variant, version, variants };
}

export function isInDevelopment(recipeId) {
  return variantsOf(recipeId).some(v => v.status === 'development');
}

export function createRecipe({ title = '', chapterId = null, groupId = null } = {}) {
  const t = now();
  const recipe = { id: uuid(), title, chapterId, groupId, tags: [], description: '', defaultVariantId: null, favorite: false, createdAt: t, updatedAt: t };
  // Nya recept börjar som "under utveckling". Första gången man trycker Klar frågar appen om det ska låsas.
  const variant = { id: uuid(), recipeId: recipe.id, name: 'Standard', status: 'development', currentVersionId: null, sortOrder: 0, createdAt: t, updatedAt: t };
  const version = {
    id: uuid(), variantId: variant.id, number: 1, ingredients: [], steps: [], servings: '',
    changeNote: '', basedOnVersionId: null, frozen: false, createdAt: t, updatedAt: t,
  };
  recipe.defaultVariantId = variant.id;
  variant.currentVersionId = version.id;
  commit([
    { store: 'recipes', put: recipe },
    { store: 'variants', put: variant },
    { store: 'versions', put: version },
  ]);
  justCreated.add(recipe.id);
  return recipe;
}

/** Recept som skapats under den här körningen och ännu inte fått frågan "Är receptet färdigt?". */
export const justCreated = new Set();

/** Nya versioner som tas bort igen om man lämnar redigeringen utan att ändra något. */
export const pendingDiscard = new Set();

export function updateRecipe(id, patch) {
  const r = state.recipes.get(id);
  if (!r) return;
  return commit([{ store: 'recipes', put: { ...r, ...patch, updatedAt: now() } }]);
}

export function updateVersion(id, patch) {
  const v = state.versions.get(id);
  if (!v) return;
  return commit([{ store: 'versions', put: { ...v, ...patch, updatedAt: now() } }]);
}

/** Uppdaterar recept och version i samma skrivning (används av redigeringsvyn). */
export function saveRecipeAndVersion(recipeId, recipePatch, versionId, versionPatch) {
  const r = state.recipes.get(recipeId);
  const v = state.versions.get(versionId);
  if (!r || !v) return;
  const t = now();
  return commit([
    { store: 'recipes', put: { ...r, ...recipePatch, updatedAt: t } },
    { store: 'versions', put: { ...v, ...versionPatch, updatedAt: t } },
  ]);
}

/** Senast visad sparas utan att trigga omritning av listor i onödan. */
export function markViewed(id) {
  const r = state.recipes.get(id);
  if (!r) return;
  const updated = { ...r, lastViewedAt: now() };
  state.recipes.set(id, updated);
  db.write([{ store: 'recipes', put: updated }]).catch(err => errorHandler(err));
}

/** Tar bort ett recept med alla varianter, versioner och testloggar. Returnerar det som behövs för att ångra. */
export function deleteRecipe(id) {
  const recipe = state.recipes.get(id);
  if (!recipe) return null;
  const variants = variantsOf(id);
  const vIds = new Set(variants.map(v => v.id));
  const versions = [...state.versions.values()].filter(v => vIds.has(v.variantId));
  const verIds = new Set(versions.map(v => v.id));
  const testlogs = [...state.testlogs.values()].filter(l => verIds.has(l.versionId));
  const removed = { recipes: [recipe], variants, versions, testlogs };
  const ops = [];
  for (const [store, list] of Object.entries(removed)) for (const o of list) ops.push({ store, del: o.id });
  commit(ops);
  return removed;
}

export function restore(removed) {
  const ops = [];
  for (const [store, list] of Object.entries(removed)) for (const o of list) ops.push({ store, put: o });
  commit(ops);
}

/* ---------- Versioner, låsning och testloggar (Fas 2) ---------- */

export function versionsOf(variantId) {
  return [...state.versions.values()].filter(v => v.variantId === variantId).sort((a, b) => a.number - b.number);
}

export function testlogsOf(versionId) {
  return [...state.testlogs.values()].filter(l => l.versionId === versionId)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export function ratingSummary(versionId) {
  const logs = testlogsOf(versionId);
  const rated = logs.filter(l => l.rating);
  return { count: logs.length, avg: rated.length ? rated.reduce((s, l) => s + l.rating, 0) / rated.length : null };
}

function copyVersion(from, variantId, number, t) {
  // Ingredienser och steg får nya id:n så att varje version är självständig.
  return {
    id: uuid(), variantId, number,
    ingredients: from.ingredients.map(i => ({ ...i, id: uuid() })),
    steps: from.steps.map(st => ({ ...st, id: uuid() })),
    servings: from.servings || '', changeNote: '', basedOnVersionId: from.id, frozen: false,
    createdAt: t, updatedAt: t,
  };
}

function nextNumber(variantId) {
  return versionsOf(variantId).reduce((m, v) => Math.max(m, v.number), 0) + 1;
}

/** Fryser aktuell version och skapar en ny redigerbar kopia. Returnerar den nya versionen. */
export function newVersion(variantId) {
  const variant = state.variants.get(variantId);
  const cur = state.versions.get(variant.currentVersionId);
  const t = now();
  const ver = copyVersion(cur, variantId, nextNumber(variantId), t);
  commit([
    { store: 'versions', put: { ...cur, frozen: true, updatedAt: t } },
    { store: 'versions', put: ver },
    { store: 'variants', put: { ...variant, status: 'development', currentVersionId: ver.id, updatedAt: t } },
  ]);
  return ver;
}

/** Ångrar en ny version som aldrig ändrades: tar bort den och gör den förra aktuell igen. */
export function discardVersion(versionId) {
  const ver = state.versions.get(versionId);
  if (!ver || !ver.basedOnVersionId) return;
  const variant = state.variants.get(ver.variantId);
  const prev = state.versions.get(ver.basedOnVersionId);
  if (!variant || !prev || variant.currentVersionId !== ver.id || testlogsOf(ver.id).length) return;
  const t = now();
  commit([
    { store: 'versions', del: ver.id },
    { store: 'versions', put: { ...prev, frozen: false, updatedAt: t } },
    { store: 'variants', put: { ...variant, status: 'development', currentVersionId: prev.id, updatedAt: t } },
  ]);
}

/** true om versionen har samma innehåll som den den kopierades från (och ingen ändringsnotis). */
export function isUnchangedCopy(versionId) {
  const ver = state.versions.get(versionId);
  const prev = ver && state.versions.get(ver.basedOnVersionId);
  if (!prev || (ver.changeNote || '').trim()) return false;
  const strip = list => JSON.stringify(list.map(({ id, ...rest }) => rest));
  return strip(ver.ingredients) === strip(prev.ingredients) && strip(ver.steps) === strip(prev.steps) && (ver.servings || '') === (prev.servings || '');
}

/** Lås: status "locked" och aktuell version fryses. */
export function lockVariant(variantId) {
  const variant = state.variants.get(variantId);
  const cur = state.versions.get(variant.currentVersionId);
  const t = now();
  commit([
    { store: 'versions', put: { ...cur, frozen: true, updatedAt: t } },
    { store: 'variants', put: { ...variant, status: 'locked', updatedAt: t } },
  ]);
}

/**
 * Lås upp: status "development" och den senaste versionen blir redigerbar igen.
 * Ingen ny version skapas – ändringar hör till den senaste versionen.
 * (Ägarens val, avviker medvetet från ursprungsspecifikationen.)
 */
export function unlockVariant(variantId) {
  const variant = state.variants.get(variantId);
  const cur = state.versions.get(variant.currentVersionId);
  const t = now();
  commit([
    { store: 'versions', put: { ...cur, frozen: false, updatedAt: t } },
    { store: 'variants', put: { ...variant, status: 'development', updatedAt: t } },
  ]);
  return state.versions.get(cur.id);
}

/** Snabbrättning: ändrar en (ev. fryst) version utan att skapa en ny. */
export function fixVersion(versionId, patch) {
  return updateVersion(versionId, patch);
}

export function addTestLog(versionId, { id = uuid(), date, rating = null, text = '', photos = [] }) {
  const t = now();
  const log = { id, versionId, date, rating, text, photos, createdAt: t, updatedAt: t };
  commit([{ store: 'testlogs', put: log }]);
  return log;
}

export function updateTestLog(id, patch) {
  const l = state.testlogs.get(id);
  if (!l) return;
  commit([{ store: 'testlogs', put: { ...l, ...patch, updatedAt: now() } }]);
}

export function deleteTestLog(id) {
  const l = state.testlogs.get(id);
  if (!l) return null;
  commit([{ store: 'testlogs', del: id }]);
  return l;
}

/* ---------- Varianter (Fas 3) ---------- */

/** Skapar en variant genom att kopiera en version (från valfri variant). Den nya varianten börjar som v1 under utveckling. */
export function createVariant(recipeId, fromVersionId, name) {
  const from = state.versions.get(fromVersionId);
  const t = now();
  const list = variantsOf(recipeId);
  const variant = {
    id: uuid(), recipeId, name: name.trim() || 'Ny variant', status: 'development', currentVersionId: null,
    sortOrder: list.length ? list[list.length - 1].sortOrder + 1 : 0, createdAt: t, updatedAt: t,
  };
  const ver = copyVersion(from, variant.id, 1, t);
  variant.currentVersionId = ver.id;
  commit([{ store: 'variants', put: variant }, { store: 'versions', put: ver }]);
  return variant;
}

export function renameVariant(variantId, name) {
  const v = state.variants.get(variantId);
  if (!v) return;
  commit([{ store: 'variants', put: { ...v, name: name.trim() || v.name, updatedAt: now() } }]);
}

export function setDefaultVariant(recipeId, variantId) {
  updateRecipe(recipeId, { defaultVariantId: variantId });
}

/** Tar bort en variant med versioner och testloggar. Returnerar det som behövs för att ångra. */
export function deleteVariant(variantId) {
  const variant = state.variants.get(variantId);
  if (!variant) return null;
  const recipe = state.recipes.get(variant.recipeId);
  const others = variantsOf(variant.recipeId).filter(v => v.id !== variantId);
  if (!others.length) return null; // sista varianten tas inte bort
  const versions = versionsOf(variantId);
  const verIds = new Set(versions.map(v => v.id));
  const testlogs = [...state.testlogs.values()].filter(l => verIds.has(l.versionId));
  const ops = [
    { store: 'variants', del: variantId },
    ...versions.map(v => ({ store: 'versions', del: v.id })),
    ...testlogs.map(l => ({ store: 'testlogs', del: l.id })),
  ];
  const removed = { variants: [variant], versions, testlogs, recipes: [recipe] };
  if (recipe.defaultVariantId === variantId) ops.push({ store: 'recipes', put: { ...recipe, defaultVariantId: others[0].id, updatedAt: now() } });
  if (selected.get(variant.recipeId) === variantId) selected.delete(variant.recipeId);
  commit(ops);
  return removed;
}

/* ---------- Inköpslistor ----------
   List: { id, title, subtitle, pinned, archived, archivedAt, items: [{ id, group?, text, checked, keep? }] }
   keep = fäst vara: ligger kvar i en fäst lista när den arkiveras. */

export function listsActive() {
  return [...state.lists.values()].filter(l => !l.archived)
    .sort((a, b) => (b.pinned - a.pinned) || ((a.sortOrder ?? 0) - (b.sortOrder ?? 0)) || (b.createdAt || '').localeCompare(a.createdAt || ''));
}

/** Sparar en ny ordning för listor (id:n i önskad ordning). */
export function reorderLists(ids) {
  const t = now();
  commit(ids.map((id, i) => ({ store: 'lists', put: { ...state.lists.get(id), sortOrder: i, updatedAt: t } })));
}

export function listsArchived() {
  return [...state.lists.values()].filter(l => l.archived)
    .sort((a, b) => (b.archivedAt || '').localeCompare(a.archivedAt || ''));
}

export function createList({ title = '', subtitle = '', pinned = false, items = [] } = {}) {
  const t = now();
  // Nya listor hamnar först.
  const sortOrder = Math.min(0, ...[...state.lists.values()].map(l => l.sortOrder ?? 0)) - 1;
  const list = { id: uuid(), title: title.trim(), subtitle: subtitle.trim(), pinned, archived: false, archivedAt: null, items, sortOrder, createdAt: t, updatedAt: t };
  commit([{ store: 'lists', put: list }]);
  return list;
}

export function updateList(id, patch) {
  const l = state.lists.get(id);
  if (!l) return;
  return commit([{ store: 'lists', put: { ...l, ...patch, updatedAt: now() } }]);
}

export function deleteList(id) {
  const l = state.lists.get(id);
  if (!l) return null;
  commit([{ store: 'lists', del: id }]);
  return l;
}

export function restoreList(list) {
  commit([{ store: 'lists', put: list }]);
}

/**
 * Arkivera. En vanlig lista flyttas till arkivet.
 * En fäst lista: en kopia sparas i arkivet och den fästa listan töms – bara titel, undertitel
 * och fästa varor (keep) blir kvar, och de fästa varorna avbockas.
 * Returnerar { archivedId, undo } där undo återställer läget före arkiveringen.
 */
export function archiveList(id) {
  const l = state.lists.get(id);
  if (!l) return null;
  const t = now();
  if (!l.pinned) {
    commit([{ store: 'lists', put: { ...l, archived: true, archivedAt: t, updatedAt: t } }]);
    return { archivedId: l.id, undo: () => commit([{ store: 'lists', put: l }]) };
  }
  const copy = { ...l, id: uuid(), pinned: false, archived: true, archivedAt: t, items: l.items.map(i => ({ ...i, id: uuid() })), createdAt: t, updatedAt: t };
  const kept = l.items.filter(i => i.keep).map(i => ({ ...i, checked: false }));
  commit([
    { store: 'lists', put: copy },
    { store: 'lists', put: { ...l, items: kept, updatedAt: t } },
  ]);
  return { archivedId: copy.id, keptCount: kept.length, undo: () => commit([{ store: 'lists', del: copy.id }, { store: 'lists', put: l }]) };
}

/* ---------- Favoriter ---------- */

export function favoritesSorted() {
  return [...state.recipes.values()].filter(r => r.favorite)
    .sort((a, b) => ((a.favOrder ?? 1e9) - (b.favOrder ?? 1e9)) || displayTitle(a).localeCompare(displayTitle(b), 'sv'));
}

/** Slår av/på favorit. Nya favoriter hamnar sist. */
export function setFavorite(id, on) {
  const max = Math.max(-1, ...favoritesSorted().map(r => r.favOrder ?? 0));
  return updateRecipe(id, on ? { favorite: true, favOrder: max + 1 } : { favorite: false });
}

export function reorderFavorites(ids) {
  const t = now();
  commit(ids.map((id, i) => ({ store: 'recipes', put: { ...state.recipes.get(id), favOrder: i, updatedAt: t } })));
}
