// Spara recept som PDF via Chromes utskrift ("Spara som PDF"). Enkel svartvit layout:
// titel, ingredienser och steg. Varje recept börjar på en ny sida.

import { icon, esc, sheet, snack, afterSheetBack } from './ui.js';
import { state, bundle, displayTitle, chaptersSorted, recipesInChapter, NO_CHAPTER } from './store.js';
import { groupItems, ingredientText } from './format.js';

function recipeHtml(id) {
  const b = bundle(id);
  if (!b) return '';
  const { recipe, variant, version, variants } = b;
  const title = displayTitle(recipe) + (variants.length > 1 ? ` – ${variant.name}` : '');
  const ings = groupItems(version.ingredients);
  const steps = groupItems(version.steps);
  let n = 1;
  return `<article class="pr-recipe">
    <h1>${esc(title)}</h1>
    ${version.servings ? `<p class="pr-servings">${esc(version.servings)}</p>` : ''}
    ${version.ingredients.length ? `<h2>Ingredienser</h2>${ings.map(g => `
      ${g.name ? `<h3>${esc(g.name)}</h3>` : ''}
      <ul>${g.items.map(i => `<li>${esc(ingredientText(i))}</li>`).join('')}</ul>`).join('')}` : ''}
    ${version.steps.length ? `<h2>Instruktioner</h2>${steps.map(g => `
      ${g.name ? `<h3>${esc(g.name)}</h3>` : ''}
      <ol start="${n}">${g.items.map(s => { n++; return `<li>${esc(s.text)}</li>`; }).join('')}</ol>`).join('')}` : ''}
  </article>`;
}

/** Öppnar Chromes utskriftsruta med de valda recepten. Där väljer man "Spara som PDF". */
export async function printRecipes(ids) {
  if (!ids.length) return;
  await afterSheetBack(); // vänta tills ett stängt bottenark har lämnat historiken
  document.getElementById('print-root')?.remove();
  const el = document.createElement('div');
  el.id = 'print-root';
  el.innerHTML = ids.map(recipeHtml).join('');
  document.body.append(el);
  const prevTitle = document.title;
  // Chrome föreslår filnamnet utifrån sidans titel.
  document.title = ids.length === 1 ? displayTitle(state.recipes.get(ids[0])) : `Receptbok – ${ids.length} recept`;
  document.documentElement.classList.add('printing');
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    document.documentElement.classList.remove('printing');
    document.title = prevTitle;
    el.remove();
  };
  window.addEventListener('afterprint', cleanup, { once: true });
  // Låt sidan ritas innan utskriftsrutan öppnas.
  requestAnimationFrame(() => setTimeout(() => {
    try { window.print(); } catch { snack('Det gick inte att öppna utskriften'); cleanup(); }
  }, 50));
}

/** Välj recept (kapitelvis) och spara dem som PDF. */
export async function pdfFlow() {
  const sections = [
    ...chaptersSorted().map(c => ({ id: c.id, name: c.name, recipes: recipesInChapter(c.id) })),
    { id: NO_CHAPTER, name: 'Utan kapitel', recipes: recipesInChapter(NO_CHAPTER) },
  ].filter(s => s.recipes.length);
  if (!sections.length) { snack('Det finns inga recept att spara än'); return; }

  const ids = await sheet({
    title: 'Spara recept som PDF',
    body: `
      <p class="sheet-text">Välj recept. Sedan öppnas Chromes utskrift – välj <b>Spara som PDF</b> som skrivare.</p>
      <div class="pick-head"><span class="field-label">Recept</span>
        <button type="button" class="link-btn" id="pdf-all">Välj alla</button></div>
      ${sections.map(s => `
        <div class="pick-list pdf-section">
          <label class="pick-row pick-chapter"><input type="checkbox" data-chapter="${s.id}"><span><b>${esc(s.name)}</b> <span class="muted">· ${s.recipes.length}</span></span></label>
          ${s.recipes.map(r => `<label class="pick-row pick-indent"><input type="checkbox" value="${r.id}" data-in="${s.id}"><span>${esc(displayTitle(r))}</span></label>`).join('')}
        </div>`).join('')}
      <p class="field-error" id="pdf-err" hidden>Välj minst ett recept.</p>`,
    actions: [
      { label: 'Avbryt', value: null },
      {
        label: 'Skapa PDF', kind: 'primary', onClick(el) {
          const chosen = [...el.querySelectorAll('input[data-in]:checked')].map(x => x.value);
          if (!chosen.length) { el.querySelector('#pdf-err').hidden = false; return false; }
          return chosen;
        },
      },
    ],
    onOpen(el) {
      const boxes = [...el.querySelectorAll('input[data-in]')];
      const chapterBoxes = [...el.querySelectorAll('input[data-chapter]')];
      const all = el.querySelector('#pdf-all');
      const btn = el.querySelector('.sheet-actions .btn-primary');
      const sync = () => {
        for (const cb of chapterBoxes) {
          const mine = boxes.filter(b => b.dataset.in === cb.dataset.chapter);
          const n = mine.filter(b => b.checked).length;
          cb.checked = n === mine.length;
          cb.indeterminate = n > 0 && n < mine.length;
        }
        const n = boxes.filter(b => b.checked).length;
        all.textContent = n === boxes.length ? 'Avmarkera alla' : 'Välj alla';
        btn.innerHTML = `${icon('file-text')}Skapa PDF${n ? ` (${n})` : ''}`;
        if (n) el.querySelector('#pdf-err').hidden = true;
      };
      all.addEventListener('click', () => {
        const on = !boxes.every(b => b.checked);
        boxes.forEach(b => { b.checked = on; });
        sync();
      });
      chapterBoxes.forEach(cb => cb.addEventListener('change', () => {
        boxes.filter(b => b.dataset.in === cb.dataset.chapter).forEach(b => { b.checked = cb.checked; });
        sync();
      }));
      boxes.forEach(b => b.addEventListener('change', sync));
      sync();
    },
  });
  if (ids) printRecipes(ids);
}
