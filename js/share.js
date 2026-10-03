import { shareText, groupItems } from './format.js';
import { displayTitle } from './store.js';
import { snack } from './ui.js';

/** Delar text via Androids delningsmeny, annars kopieras den till urklipp. */
async function shareOrCopy(title, text, copied, failed) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    snack(copied);
  } catch {
    snack(failed);
  }
}

export async function shareRecipe({ recipe, variant, version, variants }, { scale = 1 } = {}) {
  const title = displayTitle(recipe);
  const text = shareText({
    title,
    variantName: variants.length > 1 ? variant.name : '',
    servings: version.servings,
    ingredients: version.ingredients,
    steps: version.steps,
    scale,
  });
  await shareOrCopy(title, text, 'Receptet är kopierat – klistra in där du vill dela det', 'Det gick inte att dela eller kopiera receptet');
}

/** Inköpslista som text: titel och sedan varorna rakt upp och ner. Överstrukna varor tas inte med. */
export function listShareText(list) {
  const left = list.items.filter(i => !i.checked);
  const items = left.length ? left : list.items;
  const lines = [`Inköpslista – ${list.title || 'Namnlös lista'}`];
  if (list.subtitle) lines.push(`(${list.subtitle})`);
  if (items.length) lines.push('');
  groupItems(items).forEach((g, i) => {
    if (g.name) { if (i > 0) lines.push(''); lines.push(`${g.name}:`); }
    for (const it of g.items) lines.push(it.text);
  });
  return lines.join('\n');
}

export async function shareList(list) {
  await shareOrCopy(`Inköpslista – ${list.title}`, listShareText(list), 'Listan är kopierad – klistra in där du vill dela den', 'Det gick inte att dela eller kopiera listan');
}
