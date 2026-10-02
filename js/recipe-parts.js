// Delar som visar recept och testloggar. Används av receptvyn, historiken och redigeringen.

import { esc, icon, sheet, snack } from './ui.js';
import { fmtAmount, groupItems, fmtDate, isoDay } from './format.js';
import { addTestLog, updateTestLog, deleteTestLog, restore, state } from './store.js';

export function ingredientsHtml(list, { done = null } = {}) {
  if (!list.length) return '<p class="muted">Inga ingredienser.</p>';
  return groupItems(list).map(g => `
    ${g.name ? `<h2 class="group-name">${esc(g.name)}</h2>` : ''}
    <ul class="ing">${g.items.map(i => `
      <li data-id="${i.id}"${done ? ` class="${done.has(i.id) ? 'done' : ''}" role="checkbox" aria-checked="${done.has(i.id)}" tabindex="0"` : ' class="static"'}>
        <span class="amt">${fmtAmount(i.amount)}</span><span class="unit">${esc(i.unit)}</span>
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

/** Lista med testloggar. editable: varje logg är en knapp som öppnar redigering. */
export function testlogsHtml(logs, { editable = false, empty = 'Inga tester loggade än.' } = {}) {
  if (!logs.length) return `<p class="muted log-empty">${esc(empty)}</p>`;
  return `<div class="logs">${logs.map(l => {
    const inner = `<span class="log-head"><span>${esc(fmtDate(l.date))}</span>${stars(l.rating)}</span>
      ${l.text ? `<span class="log-text">${esc(l.text)}</span>` : ''}`;
    return editable
      ? `<button type="button" class="log" data-log="${l.id}" aria-label="Ändra test från ${esc(fmtDate(l.date))}">${inner}</button>`
      : `<div class="log">${inner}</div>`;
  }).join('')}</div>`;
}

/** Ark för att logga ett nytt test eller ändra ett befintligt. Returnerar true om något sparades. */
export async function testLogSheet(versionId, logId = null) {
  const cur = logId ? state.testlogs.get(logId) : null;
  const ver = state.versions.get(versionId);
  let rating = cur?.rating || 0;
  const starBtns = () => [1, 2, 3, 4, 5].map(n =>
    `<button type="button" class="star-btn${n <= rating ? ' on' : ''}" data-star="${n}" role="radio" aria-checked="${n === rating}" aria-label="${n} av 5">★</button>`).join('');
  const result = await sheet({
    title: cur ? 'Ändra test' : `Logga test av v${ver?.number ?? ''}`,
    body: `
      <label class="field"><span class="field-label">Datum</span>
        <input id="log-date" class="input" type="date" value="${esc(cur?.date || isoDay())}"></label>
      <div class="field"><span class="field-label">Betyg <span class="opt">(valfritt – tryck igen för att ta bort)</span></span>
        <div class="star-row" role="radiogroup" aria-label="Betyg">${starBtns()}</div></div>
      <label class="field"><span class="field-label">Hur blev det?</span>
        <textarea id="log-text" class="input log-input" rows="4" placeholder="t.ex. Bra smak men lite torr. Testa kortare tid i ugnen.">${esc(cur?.text || '')}</textarea></label>`,
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
      if (!cur) setTimeout(() => el.querySelector('#log-text').focus(), 60);
    },
  });
  if (!result) return false;
  if (result === 'delete') {
    const removed = deleteTestLog(logId);
    snack('Testet togs bort', { action: 'Ångra', onAction: () => restore({ testlogs: [removed] }) });
    return true;
  }
  if (cur) updateTestLog(logId, result);
  else addTestLog(versionId, result);
  snack(cur ? 'Testet är ändrat' : 'Testet är loggat');
  return true;
}

export { icon };
