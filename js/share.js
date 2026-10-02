// Dela recept som text via Androids delningsmeny, annars kopiera till urklipp.

import { shareText } from './format.js';
import { displayTitle } from './store.js';
import { snack } from './ui.js';

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
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // användaren avbröt
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    snack('Receptet är kopierat – klistra in där du vill dela det');
  } catch {
    snack('Det gick inte att dela eller kopiera receptet');
  }
}
