// Lägg ett recepts ingredienser i en inköpslista: välj ingredienser och vilken lista.

import { icon, esc, sheet, snack } from './ui.js';
import { state, displayTitle, listsActive, createList, updateList, uuid } from './store.js';
import { fmtAmount, groupItems, scaleAmount } from './format.js';
import { navigate } from './router.js';

const NEW = 'new';

/** "500 g vetemjöl" – utan anteckning, skalad. */
const itemText = (ing, scale) => [fmtAmount(scaleAmount(ing.amount, ing.unit, scale)), ing.unit, ing.name].filter(Boolean).join(' ').trim();

/** Samma vara på flera ställen i receptet (t.ex. smör i deg och fyllning) blir en rad. */
function mergeSame(ings, scale) {
  const out = [];
  const byKey = new Map();
  for (const ing of ings) {
    const name = (ing.name || '').trim().toLowerCase();
    const key = `${name}|${(ing.unit || '').toLowerCase()}`;
    const prev = name && byKey.get(key);
    if (prev && prev.amount != null && ing.amount != null) { prev.amount += ing.amount; continue; }
    const copy = { ...ing };
    out.push(copy);
    if (name && !prev) byKey.set(key, copy);
  }
  return out.map(i => itemText(i, scale)).filter(Boolean);
}

export async function addToListFlow({ recipe, version }, { scale = 1 } = {}) {
  const ings = version.ingredients.filter(i => (i.name || '').trim() || i.amount != null);
  if (!ings.length) { snack('Receptet har inga ingredienser'); return; }
  const title = displayTitle(recipe);
  const lists = listsActive();

  const res = await sheet({
    title: 'Lägg i inköpslista',
    body: `
      <div class="pick-head"><span class="field-label">Ingredienser</span>
        <button type="button" class="link-btn" id="tl-all">Avmarkera alla</button></div>
      <div class="pick-list" id="tl-ings">${groupItems(ings).map(g => `
        ${g.name ? `<p class="pick-group">${esc(g.name)}</p>` : ''}
        ${g.items.map(i => `<label class="pick-row"><input type="checkbox" value="${i.id}" checked><span>${esc(itemText(i, scale))}</span></label>`).join('')}`).join('')}
      </div>
      <p class="field-label pick-label">Lägg i</p>
      <div class="pick-list">
        <label class="pick-row"><input type="radio" name="tl-dest" value="${NEW}" checked><span>${icon('plus', 'inline-icon')} Ny lista <b>”${esc(title)}”</b></span></label>
        ${lists.map(l => `<label class="pick-row"><input type="radio" name="tl-dest" value="${l.id}"><span>${l.pinned ? icon('pin', 'inline-icon') + ' ' : ''}${esc(l.title || 'Namnlös lista')}${l.subtitle ? ` <i class="muted">${esc(l.subtitle)}</i>` : ''}</span></label>`).join('')}
      </div>
      <p class="field-error" id="tl-err" hidden>Välj minst en ingrediens.</p>`,
    actions: [
      { label: 'Avbryt', value: null },
      {
        label: 'Lägg till', kind: 'primary', onClick(el) {
          const ids = new Set([...el.querySelectorAll('#tl-ings input:checked')].map(x => x.value));
          if (!ids.size) { el.querySelector('#tl-err').hidden = false; return false; }
          return { ids, dest: el.querySelector('input[name=tl-dest]:checked').value };
        },
      },
    ],
    onOpen(el) {
      const boxes = [...el.querySelectorAll('#tl-ings input')];
      const all = el.querySelector('#tl-all');
      const sync = () => { all.textContent = boxes.every(b => b.checked) ? 'Avmarkera alla' : 'Välj alla'; };
      all.addEventListener('click', () => {
        const on = !boxes.every(b => b.checked);
        boxes.forEach(b => { b.checked = on; });
        sync();
      });
      boxes.forEach(b => b.addEventListener('change', () => { sync(); el.querySelector('#tl-err').hidden = true; }));
    },
  });
  if (!res) return;

  const texts = mergeSame(ings.filter(i => res.ids.has(i.id)), scale);
  const n = texts.length;
  let target;
  if (res.dest === NEW) {
    target = createList({ title, items: texts.map(text => ({ id: uuid(), text, checked: false })) });
  } else {
    const l = state.lists.get(res.dest);
    if (!l) return;
    // Läggs efter det som redan finns, under receptets namn så att det syns var varorna kommer ifrån.
    const group = l.items.length ? title : '';
    updateList(l.id, { items: [...l.items, ...texts.map(text => ({ id: uuid(), text, checked: false, ...(group ? { group } : {}) }))] });
    target = l;
  }
  snack(`${n} ${n === 1 ? 'vara' : 'varor'} lades i ”${target.title || 'listan'}”`, {
    action: 'Visa', duration: 6000, onAction: () => navigate(`/lista/${target.id}`),
  });
}
