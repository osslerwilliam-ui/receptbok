// Jämför två versioner: ingredienser (matchas på namn) och steg (radvis jämförelse).

import { norm } from './search.js';
import { fmtAmount } from './format.js';

const amountText = i => [fmtAmount(i.amount), i.unit].filter(Boolean).join(' ');

/**
 * Returnerar en lista i den nya versionens ordning med borttagna insprängda där de stod:
 * [{ type: 'same'|'added'|'removed'|'changed', a?, b?, changes?: [text] }]
 */
export function diffIngredients(oldList, newList) {
  const key = i => norm(i.name).trim();
  const pool = new Map();
  oldList.forEach((i, idx) => {
    const k = key(i);
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k).push({ i, idx });
  });
  const matched = new Set();
  const rows = [];
  for (const b of newList) {
    const cand = pool.get(key(b));
    const hit = cand && cand.shift();
    if (!hit) { rows.push({ type: 'added', b }); continue; }
    matched.add(hit.idx);
    const a = hit.i;
    const changes = [];
    if (amountText(a) !== amountText(b)) changes.push(`${amountText(a) || '–'} → ${amountText(b) || '–'}`);
    if ((a.note || '') !== (b.note || '')) changes.push(`anteckning: ${a.note || '–'} → ${b.note || '–'}`);
    if ((a.group || '') !== (b.group || '')) changes.push(`grupp: ${a.group || '–'} → ${b.group || '–'}`);
    if (a.name !== b.name && !changes.length) changes.push(`${a.name} → ${b.name}`);
    rows.push({ type: changes.length ? 'changed' : 'same', a, b, changes, oldIdx: hit.idx });
  }
  // Sätt in borttagna efter närmaste föregående matchade rad.
  oldList.forEach((a, idx) => {
    if (matched.has(idx)) return;
    let pos = 0;
    for (let r = rows.length - 1; r >= 0; r--) {
      if (rows[r].oldIdx != null && rows[r].oldIdx < idx) { pos = r + 1; break; }
    }
    rows.splice(pos, 0, { type: 'removed', a, oldIdx: idx - 0.5 });
  });
  return rows;
}

/** Steg: längsta gemensamma följd; en borttagen rad direkt följd av en tillagd blir "ändrad". */
export function diffSteps(oldList, newList) {
  const A = oldList.map(s => norm(s.text).trim());
  const B = newList.map(s => norm(s.text).trim());
  const n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  }
  const raw = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { raw.push({ type: 'same', a: oldList[i++], b: newList[j++] }); }
    else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) raw.push({ type: 'added', b: newList[j++] });
    else raw.push({ type: 'removed', a: oldList[i++] });
  }
  // Para ihop borttagna + tillagda i samma lucka som ändrade.
  const out = [];
  for (let k = 0; k < raw.length;) {
    if (raw[k].type === 'same') { out.push(raw[k++]); continue; }
    const rem = [], add = [];
    while (k < raw.length && raw[k].type !== 'same') (raw[k].type === 'removed' ? rem : add).push(raw[k++]);
    const pairs = Math.min(rem.length, add.length);
    for (let p = 0; p < pairs; p++) out.push({ type: 'changed', a: rem[p].a, b: add[p].b });
    for (const r of rem.slice(pairs)) out.push(r);
    for (const a of add.slice(pairs)) out.push(a);
  }
  return out;
}

export function diffMeta(a, b) {
  const out = [];
  if ((a.servings || '') !== (b.servings || '')) out.push({ label: 'Ger', from: a.servings || '–', to: b.servings || '–' });
  return out;
}
