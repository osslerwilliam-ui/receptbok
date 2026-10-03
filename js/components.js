// Återanvändbara delar: receptrader, kapitelkort och kapiteldialoger.

import { icon, esc, sheet } from './ui.js';
import { enableDragSort } from './dragsort.js';
import { CHAPTER_COLORS, chaptersSorted, chapterOf, displayTitle, isInDevelopment, NO_CHAPTER, recipesInChapter } from './store.js';

export const EMOJIS = ['🍞', '🥐', '🥘', '🍲', '🥗', '🍝', '🐟', '🍗', '🥩', '🥦', '🍰', '🍪', '🥧', '🍓', '🍋', '🧀', '🥞', '🍕', '🌶️', '🫙', '🍹', '☕'];

export const colorVar = ch => `var(--ch-${ch && CHAPTER_COLORS.includes(ch.color) ? ch.color : 'lera'})`;

export function link(path) { return `href="#${esc(path)}" data-link`; }

export function recipeRow(r, { sub, titleHtml, path = null } = {}) {
  const ch = chapterOf(r);
  const dev = isInDevelopment(r.id);
  return `<a class="rrow${dev ? ' dev' : ''}" ${link(path || '/recept/' + r.id)} style="--c: ${colorVar(ch)}">
    <span class="dot" aria-hidden="true"></span>
    <span class="txt"><span class="t">${titleHtml ?? esc(displayTitle(r))}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</span>
    ${dev ? `<span class="badge">${icon('flask-conical')}Utv.</span>` : ''}
    ${icon('chevron-right', 'chev')}
  </a>`;
}

export function chapterCard(ch) {
  const n = recipesInChapter(ch.id).length;
  return `<a class="chapter" ${link('/kapitel/' + ch.id)} data-chapter="${ch.id}" style="--c: ${colorVar(ch)}">
    <span class="emoji" aria-hidden="true">${esc(ch.emoji || '')}</span>
    <span><span class="name">${esc(ch.name)}</span><span class="count">${n} ${n === 1 ? 'recept' : 'recept'}</span></span>
  </a>`;
}

export function noChapterCard() {
  const n = recipesInChapter(NO_CHAPTER).length;
  if (!n) return '';
  return `<a class="chapter" ${link('/kapitel/' + NO_CHAPTER)} style="--c: var(--ch-lera)">
    <span class="emoji" aria-hidden="true">📄</span>
    <span><span class="name">Utan kapitel</span><span class="count">${n} recept</span></span>
  </a>`;
}

/** Dialog för att skapa eller ändra ett kapitel. Returnerar { name, emoji, color } eller null. */
export function chapterSheet(ch = null) {
  const cur = ch || { name: '', emoji: '', color: CHAPTER_COLORS[chaptersSorted().length % CHAPTER_COLORS.length] };
  return sheet({
    title: ch ? 'Ändra kapitel' : 'Nytt kapitel',
    body: `
      <label class="field"><span class="field-label">Namn</span>
        <input id="ch-name" class="input" type="text" maxlength="60" value="${esc(cur.name)}" placeholder="t.ex. Bröd" autocomplete="off" enterkeyhint="done"></label>
      <div class="field"><span class="field-label">Ikon</span>
        <div class="emoji-grid" role="radiogroup" aria-label="Ikon">
          <button type="button" class="emoji-opt none" data-emoji="" aria-label="Ingen ikon">–</button>
          ${EMOJIS.map(e => `<button type="button" class="emoji-opt" data-emoji="${e}">${e}</button>`).join('')}
        </div>
      </div>
      <div class="field"><span class="field-label">Färg</span>
        <div class="swatches" role="radiogroup" aria-label="Färg">
          ${CHAPTER_COLORS.map(c => `<button type="button" class="swatch" data-color="${c}" style="--c: var(--ch-${c})" aria-label="${c}"></button>`).join('')}
        </div>
      </div>
      <p class="field-error" id="ch-err" hidden>Skriv ett namn på kapitlet.</p>`,
    actions: [
      { label: 'Avbryt', value: null },
      {
        label: ch ? 'Spara' : 'Skapa kapitel', kind: 'primary', onClick(el) {
          const name = el.querySelector('#ch-name').value.trim();
          if (!name) { el.querySelector('#ch-err').hidden = false; el.querySelector('#ch-name').focus(); return false; }
          return { name, emoji: el.dataset.emoji, color: el.dataset.color };
        },
      },
    ],
    onOpen(el) {
      const pick = (attr, val) => {
        el.dataset[attr] = val;
        el.querySelectorAll(`[data-${attr}]`).forEach(b => b.setAttribute('aria-checked', b.dataset[attr] === val));
      };
      pick('emoji', cur.emoji || '');
      pick('color', cur.color);
      el.querySelectorAll('[data-emoji]').forEach(b => b.setAttribute('role', 'radio'));
      el.querySelectorAll('[data-color]').forEach(b => b.setAttribute('role', 'radio'));
      el.querySelector('.emoji-grid').onclick = e => { const b = e.target.closest('[data-emoji]'); if (b) pick('emoji', b.dataset.emoji); };
      el.querySelector('.swatches').onclick = e => { const b = e.target.closest('[data-color]'); if (b) pick('color', b.dataset.color); };
      const input = el.querySelector('#ch-name');
      input.addEventListener('keydown', e => { if (e.key === 'Enter') el.querySelector('.sheet-actions .btn-primary').click(); });
      if (!ch) setTimeout(() => input.focus(), 50);
    },
  });
}

/** Låter användaren välja kapitel. Returnerar kapitel-id, NO_CHAPTER eller null (avbrutet). */
export function pickChapterSheet({ title = 'Välj kapitel', exclude = null, current = null } = {}) {
  const chapters = chaptersSorted().filter(c => c.id !== exclude);
  const items = [...chapters.map(c => ({ id: c.id, label: c.name, emoji: c.emoji, c: colorVar(c) })),
    { id: NO_CHAPTER, label: 'Utan kapitel', emoji: '📄', c: 'var(--ch-lera)' }].filter(i => i.id !== exclude);
  return sheet({
    title,
    body: `<div class="menu-list">${items.map(i => `
      <button type="button" class="menu-item${i.id === current ? ' current' : ''}" data-id="${i.id}" style="--c: ${i.c}">
        <span class="menu-emoji">${esc(i.emoji || '•')}</span><span>${esc(i.label)}</span>${i.id === current ? icon('check') : ''}</button>`).join('')}</div>`,
    actions: [{ label: 'Avbryt', value: null }],
    onOpen(el, close) {
      el.querySelectorAll('[data-id]').forEach(b => { b.onclick = () => close(b.dataset.id); });
    },
  });
}

export function emptyState({ title, text, button = '', icon: ic = '' }) {
  return `<div class="empty">${ic ? `<div class="empty-icon">${icon(ic)}</div>` : ''}
    <div class="big">${esc(title)}</div>${text ? `<p>${esc(text)}</p>` : ''}${button}</div>`;
}

/**
 * Sorteringsark: dra raderna i handtaget till önskad ordning.
 * items: [{ id, label, sub? }], marked: id att markera (det man höll på). Returnerar id:n i ny ordning eller null.
 */
export async function sortSheet({ title, items, marked = null }) {
  let order = items.slice();
  const draw = () => order.map(it => `
    <li class="sort-row${it.id === marked ? ' marked' : ''}" data-id="${esc(it.id)}">
      <span class="sort-name">${esc(it.label)}</span>${it.sub ? `<span class="sort-sub">${esc(it.sub)}</span>` : ''}
      <span class="sort-grip" aria-label="Dra för att flytta ${esc(it.label)}">${icon('grip-vertical')}</span>
    </li>`).join('');
  const ok = await sheet({
    title,
    body: `<p class="sheet-text">Dra i ${icon('grip-vertical', 'inline-icon')} för att ändra ordningen.</p><ul class="sort-list">${draw()}</ul>`,
    actions: [{ label: 'Avbryt', value: false }, { label: 'Klar', value: true, kind: 'primary' }],
    onOpen(el) {
      const ul = el.querySelector('.sort-list');
      enableDragSort(ul, {
        rowSel: '.sort-row', handleSel: '.sort-grip', holdMs: 0,
        onMove(from, to) { const [it] = order.splice(from, 1); order.splice(to, 0, it); ul.innerHTML = draw(); },
      });
    },
  });
  return ok ? order.map(it => it.id) : null;
}

export { displayTitle };
