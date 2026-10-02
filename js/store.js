// All data hålls i minnet medan appen körs (snabbt) och skrivs till IndexedDB vid varje ändring.

import * as db from './db.js';
import { STORES } from './db.js';

export const state = {
  chapters: new Map(),
  recipes: new Map(),
  variants: new Map(),
  versions: new Map(),
  testlogs: new Map(),
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
    id: uuid(), name: name.trim() || 'Nytt kapitel', emoji, color: color || CHAPTER_COLORS[list.length % CHAPTER_COLORS.length],
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
  const ops = recipesInChapter(id).map(r => ({ store: 'recipes', put: { ...r, chapterId: moveTo, updatedAt: t } }));
  ops.push({ store: 'chapters', del: id });
  commit(ops);
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

/** Receptet med standardvariant och dess aktuella version. */
export function bundle(recipeId) {
  const recipe = state.recipes.get(recipeId);
  if (!recipe) return null;
  const variants = variantsOf(recipeId);
  const variant = state.variants.get(recipe.defaultVariantId) || variants[0];
  const version = variant && state.versions.get(variant.currentVersionId);
  if (!variant || !version) return null;
  return { recipe, variant, version, variants };
}

export function isInDevelopment(recipeId) {
  return variantsOf(recipeId).some(v => v.status === 'development');
}

export function createRecipe({ title = '', chapterId = null } = {}) {
  const t = now();
  const recipe = { id: uuid(), title, chapterId, tags: [], description: '', defaultVariantId: null, createdAt: t, updatedAt: t };
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

export function addTestLog(versionId, { date, rating = null, text = '' }) {
  const t = now();
  const log = { id: uuid(), versionId, date, rating, text, createdAt: t, updatedAt: t };
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
