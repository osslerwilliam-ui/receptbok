// Formatering och tolkning av mängder, ingrediensrader och delningstext.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const FRACTIONS = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const FRACTION_OUT = [[0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1 / 3, '⅓'], [2 / 3, '⅔']];

/** 1.5 → "1½", 0.25 → "¼", 2.4 → "2,4", null → "" */
export function fmtAmount(n) {
  if (n == null || Number.isNaN(n)) return '';
  const whole = Math.floor(n);
  const rest = n - whole;
  if (rest > 0.001) {
    for (const [v, ch] of FRACTION_OUT) if (Math.abs(rest - v) < 0.01) return (whole || '') + ch;
  }
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

/** Tolkar "1,5", "1.5", "½", "1 ½", "1/2", "1 1/2". Returnerar number, null (tomt) eller NaN (ogiltigt). */
export function parseAmount(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  let m = t.match(/^(\d+)?\s*([¼½¾⅓⅔⅛])$/);
  if (m) return (m[1] ? +m[1] : 0) + FRACTIONS[m[2]];
  m = t.match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/);
  if (m && +m[3] !== 0) return (m[1] ? +m[1] : 0) + +m[2] / +m[3];
  m = t.match(/^\d+(?:[.,]\d+)?$/);
  if (m) return parseFloat(t.replace(',', '.'));
  return NaN;
}

export const UNITS = ['g', 'kg', 'hg', 'mg', 'l', 'dl', 'cl', 'ml', 'msk', 'tsk', 'krm', 'st', 'nypa', 'port', 'pkt', 'paket', 'förp', 'burk', 'burkar', 'påse', 'påsar', 'klyfta', 'klyftor', 'kruka', 'krukor', 'knippe', 'knippen', 'skiva', 'skivor', 'kvist', 'kvistar', 'blad', 'cm', 'liter', 'gram', 'droppe', 'droppar', 'tärning', 'tärningar'];
const UNIT_SET = new Set(UNITS);

/**
 * Tolkar en textrad (best effort):
 *   "500 g vetemjöl"            → { amount: 500, unit: 'g', name: 'vetemjöl' }
 *   "1 ½ dl mjölk, ljummen"     → { amount: 1.5, unit: 'dl', name: 'mjölk', note: 'ljummen' }
 *   "Deg:"                      → { group: 'Deg' }
 *   "salt"                      → { amount: null, unit: '', name: 'salt' }
 */
export function parseIngredientLine(line) {
  let t = line.trim().replace(/^[-•*–·]\s*/, '').replace(/\s+/g, ' ');
  if (!t) return null;
  if (/:$/.test(t) && t.length < 40) return { group: t.slice(0, -1).trim() };
  t = t.replace(/^(ca\.?|cirka)\s+/i, '');
  let amount = null;
  const m = t.match(/^(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+\s*[¼½¾⅓⅔⅛]|[¼½¾⅓⅔⅛]|\d+(?:[.,]\d+)?)(?=\s|[a-zåäö]|$)\s*/i);
  if (m) {
    const a = parseAmount(m[1].replace(/(\d)([¼½¾⅓⅔⅛])/, '$1 $2'));
    if (!Number.isNaN(a)) { amount = a; t = t.slice(m[0].length); }
  }
  let unit = '';
  const um = t.match(/^([a-zåäö]+)\.?(\s+|$)/i);
  if (um && UNIT_SET.has(um[1].toLowerCase()) && (amount != null || t.split(' ').length > 1)) {
    unit = um[1].toLowerCase();
    t = t.slice(um[0].length);
  }
  let name = t.trim();
  let note = '';
  const nm = name.match(/^(.*?)(?:,\s*|\s+\()(.+?)\)?$/);
  if (nm && nm[1]) { name = nm[1].trim(); note = nm[2].trim(); }
  return { amount, unit, name, note };
}

/** Tolkar inklistrade instruktioner: tar bort numrering, rader som slutar med ":" blir grupper. */
export function parseStepLines(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim().replace(/^(\d+[.)]|[-•*–])\s*/, '');
    if (!t) continue;
    if (/:$/.test(t) && t.length < 40) out.push({ group: t.slice(0, -1).trim() });
    else out.push({ text: t });
  }
  return out;
}

export function ingredientText(ing) {
  const parts = [fmtAmount(ing.amount), ing.unit, ing.name].filter(Boolean).join(' ');
  return ing.note ? `${parts}, ${ing.note}` : parts;
}

/** Grupperar en lista med { group } i följd: [{ name, items: [...] }] */
export function groupItems(list) {
  const groups = [];
  for (const item of list) {
    const g = (item.group || '').trim();
    if (!groups.length || groups[groups.length - 1].name !== g) groups.push({ name: g, items: [] });
    groups[groups.length - 1].items.push(item);
  }
  return groups;
}

/** Text för delning enligt formatet i CLAUDE.md. */
export function shareText({ title, variantName, servings, ingredients, steps }) {
  const lines = [variantName ? `${title} – ${variantName}` : title];
  if (servings) lines.push(`(${servings})`);
  if (ingredients.length) {
    lines.push('', 'INGREDIENSER');
    groupItems(ingredients).forEach((g, i) => {
      if (g.name) { if (i > 0) lines.push(''); lines.push(`${g.name}:`); }
      for (const ing of g.items) lines.push(`- ${ingredientText(ing)}`);
    });
  }
  if (steps.length) {
    lines.push('', 'INSTRUKTIONER');
    let n = 1;
    groupItems(steps).forEach((g, i) => {
      if (g.name) { if (i > 0) lines.push(''); lines.push(`${g.name}:`); }
      for (const s of g.items) lines.push(`${n++}. ${s.text}`);
    });
  }
  return lines.join('\n');
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${thisYear ? '' : ' ' + d.getFullYear()}`;
}

/** "i dag", "i går", "tisdag", "12 sep" */
export function fmtRelative(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const start = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(new Date()) - start(d)) / 864e5);
  if (days <= 0) return 'i dag';
  if (days === 1) return 'i går';
  if (days < 7) return d.toLocaleDateString('sv-SE', { weekday: 'long' });
  return fmtDate(iso);
}

export const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
