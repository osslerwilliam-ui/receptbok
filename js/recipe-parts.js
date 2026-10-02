// Delar som visar recept och testloggar. Används av receptvyn, historiken och redigeringen.

import { esc, icon, sheet, snack } from './ui.js';
import { fmtAmount, groupItems, fmtDate, isoDay, scaleAmount } from './format.js';
import { addTestLog, updateTestLog, deleteTestLog, restore, state, uuid } from './store.js';
import * as db from './db.js';
import { shrink, newPhotoRecord, thumbsHtml, tempUrl, photoUrl, hydrate } from './photos.js';

export function ingredientsHtml(list, { done = null, scale = 1 } = {}) {
  if (!list.length) return '<p class="muted">Inga ingredienser.</p>';
  return groupItems(list).map(g => `
    ${g.name ? `<h2 class="group-name">${esc(g.name)}</h2>` : ''}
    <ul class="ing">${g.items.map(i => `
      <li data-id="${i.id}"${done ? ` class="${done.has(i.id) ? 'done' : ''}" role="checkbox" aria-checked="${done.has(i.id)}" tabindex="0"` : ' class="static"'}>
        <span class="amt${scale !== 1 && i.amount != null ? ' scaled' : ''}">${fmtAmount(scaleAmount(i.amount, i.unit, scale))}</span><span class="unit">${esc(i.unit)}</span>
        <span class="name">${esc(i.name)}${i.note ? ` <span class="note">${esc(i.note)}</span>` : ''}</span>
      </li>`).join('')}</ul>`).join('');
}

export function stepsHtml(list, { done = null } = {}) {
  if (!list.length) return '<p class="muted">Inga instruktioner.</p>';
  let n = 0;
  return groupItems(list).map(g => `
    ${g.name ? `<h2 class="group-name">${esc(g.name)}</h2>` : ''}
    <ol class="steps">${g.items.map(st => `
      <li data-id="${st.id}"${done ? ` class="${done.has(st.id) ? 'done' : ''}" role="checkbox" aria-checked="${done.has(st.id)}" tabindex="0"` : ' class="static"'}>
        <span class="step-n" aria-hidden="true">${++n}</span><span class="step-text">${esc(st.text)}</span></li>`).join('')}</ol>`).join('');
}

export function stars(rating, cls = '') {
  if (!rating) return '';
  return `<span class="stars ${cls}" aria-label="Betyg ${rating} av 5">${'★'.repeat(rating)}<span class="stars-off">${'★'.repeat(5 - rating)}</span></span>`;
}

export function avgText(avg) {
  return avg == null ? '' : `★ ${avg.toFixed(1).replace('.', ',')}`;
}

/** Lista med testloggar. editable: tryck på loggen för att ändra den. Foton visas under. */
export function testlogsHtml(logs, { editable = false, empty = 'Inga tester loggade än.' } = {}) {
  if (!logs.length) return `<p class="muted log-empty">${esc(empty)}</p>`;
  return `<div class="logs">${logs.map(l => {
    const inner = `<span class="log-head"><span>${esc(fmtDate(l.date))}</span>${stars(l.rating)}</span>
      ${l.text ? `<span class="log-text">${esc(l.text)}</span>` : ''}`;
    return `<div class="log">
      ${editable
        ? `<button type="button" class="log-main" data-log="${l.id}" aria-label="Ändra test från ${esc(fmtDate(l.date))}">${inner}</button>`
        : `<div class="log-main">${inner}</div>`}
      ${thumbsHtml(l.photos)}
    </div>`;
  }).join('')}</div>`;
}

/** Ark för att logga ett nytt test eller ändra ett befintligt. Returnerar true om något sparades. */
export async function testLogSheet(versionId, logId = null) {
  const cur = logId ? state.testlogs.get(logId) : null;
  const ver = state.versions.get(versionId);
  const id = cur?.id || uuid();
  let rating = cur?.rating || 0;
  let photos = [...(cur?.photos || [])];   // id:n som ska finnas efter sparning
  const added = new Map();                  // nya foton: id → fotopost (sparas först vid Spara)

  const starBtns = () => [1, 2, 3, 4, 5].map(n =>
    `<button type="button" class="star-btn${n <= rating ? ' on' : ''}" data-star="${n}" role="radio" aria-checked="${n === rating}" aria-label="${n} av 5">★</button>`).join('');
  const photoGrid = () => `${photos.map(pid => `
    <span class="thumb edit-thumb">
      <img ${added.has(pid) ? `src="${tempUrl(pid, added.get(pid).blob)}"` : `data-photo="${pid}"`} alt="">
      <button type="button" class="thumb-del" data-del-photo="${pid}" aria-label="Ta bort foto">${icon('x')}</button>
    </span>`).join('')}
    <label class="thumb add-photo">${icon('camera')}<span>Kamera</span>
      <input type="file" accept="image/*" capture="environment" hidden class="photo-input"></label>
    <label class="thumb add-photo">${icon('image')}<span>Galleri</span>
      <input type="file" accept="image/*" multiple hidden class="photo-input"></label>`;

  const result = await sheet({
    title: cur ? 'Ändra test' : `Logga test av v${ver?.number ?? ''}`,
    body: `
      <label class="field"><span class="field-label">Datum</span>
        <input id="log-date" class="input" type="date" value="${esc(cur?.date || isoDay())}"></label>
      <div class="field"><span class="field-label">Betyg <span class="opt">(valfritt – tryck igen för att ta bort)</span></span>
        <div class="star-row" role="radiogroup" aria-label="Betyg">${starBtns()}</div></div>
      <label class="field"><span class="field-label">Hur blev det?</span>
        <textarea id="log-text" class="input log-input" rows="4" placeholder="t.ex. Bra smak men lite torr. Testa kortare tid i ugnen.">${esc(cur?.text || '')}</textarea></label>
      <div class="field"><span class="field-label">Foton <span class="opt">(valfritt)</span></span>
        <div class="thumbs photo-edit" id="photo-grid">${photoGrid()}</div>
        <p class="field-error" id="photo-err" hidden></p></div>`,
    actions: [
      ...(cur ? [{ label: 'Ta bort', value: 'delete', kind: 'danger', icon: 'trash' }] : [{ label: 'Avbryt', value: null }]),
      {
        label: 'Spara', kind: 'primary', onClick: el => ({
          date: el.querySelector('#log-date').value || isoDay(),
          rating: rating || null,
          text: el.querySelector('#log-text').value.trim(),
        }),
      },
    ],
    onOpen(el) {
      const row = el.querySelector('.star-row');
      row.onclick = e => {
        const b = e.target.closest('[data-star]');
        if (!b) return;
        const n = +b.dataset.star;
        rating = rating === n ? 0 : n;
        row.innerHTML = starBtns();
      };
      const grid = el.querySelector('#photo-grid');
      const redraw = () => { grid.innerHTML = photoGrid(); hydrate(grid); };
      hydrate(grid);
      grid.addEventListener('click', e => {
        const del = e.target.closest('[data-del-photo]');
        if (!del) return;
        photos = photos.filter(p => p !== del.dataset.delPhoto);
        added.delete(del.dataset.delPhoto);
        redraw();
      });
      grid.addEventListener('change', async e => {
        if (!e.target.classList.contains('photo-input')) return;
        const files = [...e.target.files];
        const err = el.querySelector('#photo-err');
        err.hidden = true;
        grid.classList.add('busy');
        for (const f of files) {
          try {
            const rec = newPhotoRecord(id, await shrink(f));
            added.set(rec.id, rec);
            photos.push(rec.id);
          } catch {
            err.textContent = 'En bild kunde inte läsas. Prova en annan bild.';
            err.hidden = false;
          }
        }
        grid.classList.remove('busy');
        redraw();
      });
      if (!cur) setTimeout(() => el.querySelector('#log-text').focus(), 60);
    },
  });
  if (!result) return false;
  if (result === 'delete') {
    // Fotona ligger kvar tills appen startas om, så att Ångra fungerar.
    const removed = deleteTestLog(logId);
    snack('Testet togs bort', { action: 'Ångra', onAction: () => restore({ testlogs: [removed] }) });
    return true;
  }
  try {
    await db.putPhotos([...added.values()].filter(r => photos.includes(r.id)));
  } catch (err) {
    console.error(err);
    snack('Fotona kunde inte sparas – telefonens lagring kan vara full.', { duration: 7000 });
    photos = photos.filter(p => !added.has(p));
  }
  if (cur) {
    const gone = cur.photos?.filter(p => !photos.includes(p)) || [];
    updateTestLog(logId, { ...result, photos });
    db.deletePhotos(gone).catch(() => {});
  } else {
    addTestLog(versionId, { id, ...result, photos });
  }
  snack(cur ? 'Testet är ändrat' : 'Testet är loggat');
  return true;
}

export { icon, photoUrl };
