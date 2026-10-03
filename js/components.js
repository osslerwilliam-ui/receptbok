// Återanvändbara delar: receptrader, kapitelkort och kapiteldialoger.

import { icon, esc, sheet } from './ui.js';
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
  return `<a class="chapter" ${link('/kapitel/' + ch.id)} data-chapter="${ch.id}" data-id="${ch.id}" style="--c: ${colorVar(ch)}">
    <span class="emoji" aria-hidden="true">${esc(ch.emoji || '')}</span>
    <span class="name">${esc(ch.name)}</span><span class="count">${n} recept</span>
  </a>`;
}

export function noChapterCard() {
  const n = recipesInChapter(NO_CHAPTER).length;
  if (!n) return '';
  return `<a class="chapter" ${link('/kapitel/' + NO_CHAPTER)} style="--c: var(--ch-lera)">
    <span class="emoji" aria-hidden="true">📄</span>
    <span class="name">Utan kapitel</span><span class="count">${n} recept</span>
  </a>`;
}

/**
 * Långa ord i kapitelnamn delas inte mitt i ("Fermen-tering"): texten krymps i stället
 * tills det längsta ordet får plats (högst till 70 %). Korta namn behåller sin storlek.
 */
export function fitChapterNames(root) {
  const run = () => {
    for (const el of root.querySelectorAll('.chapter .name')) {
      el.style.fontSize = '';
      const base = parseFloat(getComputedStyle(el).fontSize);
      let size = base;
      while (el.scrollWidth > el.clientWidth + 1 && size > base * 0.7) {
        size *= 0.95;
        el.style.fontSize = `${size}px`;
      }
    }
  };
  run();
  document.fonts?.ready.then(() => { if (root.isConnected) run(); });
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

/**
 * Låter användaren välja kapitel. Returnerar kapitel-id, NO_CHAPTER eller null (avbrutet).
 * Med withGroups visas även kapitlens grupper; en grupp returneras som "kapitel-id|grupp-id".
 */
export function pickChapterSheet({ title = 'Välj kapitel', exclude = null, current = null, withGroups = false } = {}) {
  const chapters = chaptersSorted().filter(c => c.id !== exclude);
  const items = [...chapters.flatMap(c => [
    { id: c.id, label: c.name, emoji: c.emoji, c: colorVar(c) },
    ...(withGroups ? (c.groups || []).map(g => ({ id: `${c.id}|${g.id}`, label: g.name, sub: true, c: colorVar(c) })) : []),
  ]),
    { id: NO_CHAPTER, label: 'Utan kapitel', emoji: '📄', c: 'var(--ch-lera)' }].filter(i => i.id !== exclude);
  return sheet({
    title,
    body: `<div class="menu-list">${items.map(i => `
      <button type="button" class="menu-item${i.id === current ? ' current' : ''}${i.sub ? ' menu-sub' : ''}" data-id="${i.id}" style="--c: ${i.c}">
        ${i.sub ? icon('chevron-right') : `<span class="menu-emoji">${esc(i.emoji || '•')}</span>`}<span>${esc(i.label)}</span>${i.id === current ? icon('check') : ''}</button>`).join('')}</div>`,
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

export { displayTitle };
