// Sökning i minnet. Indexet byggs om när datan ändras (snabbt även med tusentals recept).
//
// Söker i titel, ingredienser, taggar och kapitel. Skiftlägesokänsligt, delsträngar
// och enkel stavfelstolerans (ett tecken fel) för ord med minst fyra bokstäver.
// å, ä och ö är egna bokstäver: "a" hittar alltså inte "å".

import { state, rev, displayTitle, chapterOf, bundle } from './store.js';

export const norm = s => (s || '').toLocaleLowerCase('sv').normalize('NFC');
const words = s => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

let index = [];
let indexRev = -1;

function build() {
  index = [];
  for (const recipe of state.recipes.values()) {
    const b = bundle(recipe.id);
    const title = displayTitle(recipe);
    const ch = chapterOf(recipe);
    const fields = [];
    if (b) {
      // Alla varianters aktuella versioner
      const seen = new Set();
      for (const v of b.variants) {
        const ver = state.versions.get(v.currentVersionId);
        for (const ing of ver?.ingredients || []) {
          const n = norm(ing.name);
          if (n && !seen.has(n)) { seen.add(n); fields.push({ kind: 'ingrediens', text: ing.name, n, w: words(n), base: 50 }); }
        }
      }
    }
    for (const tag of recipe.tags || []) {
      const n = norm(tag);
      if (n) fields.push({ kind: 'tagg', text: tag, n, w: words(n), base: 42 });
    }
    if (ch) { const n = norm(ch.name); fields.push({ kind: 'kapitel', text: ch.name, n, w: words(n), base: 30 }); }
    const tn = norm(title);
    index.push({ id: recipe.id, title, tn, tw: words(tn), fields, chapter: ch });
  }
  indexRev = rev;
}

// Damerau-Levenshtein (begränsad): true om avståndet är högst 1.
function within1(a, b) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (i === la && i === lb) return true;
  if (la === lb) {
    // ersättning eller byte av två intilliggande
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

// Stavfelstolerant matchning mot ett ord, även början av längre ord ("kardemum" ~ "kardemumma").
function fuzzyWord(tok, word) {
  if (word.length < 3) return false;
  if (within1(tok, word)) return true;
  if (word.length > tok.length) {
    return within1(tok, word.slice(0, tok.length)) || within1(tok, word.slice(0, tok.length + 1)) || within1(tok, word.slice(0, tok.length - 1));
  }
  return false;
}

function matchToken(e, tok) {
  // Exakta delsträngar först
  const ti = e.tn.indexOf(tok);
  if (ti >= 0) {
    const atWord = ti === 0 || /[^\p{L}\p{N}]/u.test(e.tn[ti - 1]);
    return { score: 100 + (ti === 0 ? 20 : 0) + (atWord ? 10 : 0), kind: 'titel' };
  }
  let best = null;
  for (const f of e.fields) {
    if (f.n.includes(tok) && (!best || f.base > best.score)) best = { score: f.base, kind: f.kind, text: f.text };
  }
  if (best) return best;
  if (tok.length < 4) return null;
  // Stavfel
  if (e.tw.some(w => fuzzyWord(tok, w))) return { score: 60, kind: 'titel', fuzzy: true };
  for (const f of e.fields) {
    if (f.w.some(w => fuzzyWord(tok, w)) && (!best || f.base > best.score)) best = { score: f.base * 0.5, kind: f.kind, text: f.text };
  }
  return best;
}

/** Returnerar [{ id, title, score, reason: {kind, text} | null, ranges: [[start, end]] }] sorterat. */
export function search(query, limit = 60) {
  if (indexRev !== rev) build();
  const toks = [...new Set(words(norm(query)))];
  if (!toks.length) return [];
  const out = [];
  for (const e of index) {
    let score = 0;
    let reason = null;
    let ok = true;
    for (const tok of toks) {
      const m = matchToken(e, tok);
      if (!m) { ok = false; break; }
      score += m.score;
      if (m.kind !== 'titel' && (!reason || m.score > reason.score)) reason = m;
    }
    if (!ok) continue;
    out.push({ id: e.id, title: e.title, score, reason: reason && { kind: reason.kind, text: reason.text }, ranges: ranges(e.tn, toks), chapter: e.chapter });
  }
  out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'sv'));
  return out.slice(0, limit);
}

function ranges(tn, toks) {
  const r = [];
  for (const tok of toks) {
    const i = tn.indexOf(tok);
    if (i >= 0) r.push([i, i + tok.length]);
  }
  return r.sort((a, b) => a[0] - b[0]);
}
