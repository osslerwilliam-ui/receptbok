// Gemensamma UI-delar: snackbar, bottenark (dialoger) och små hjälpfunktioner.

import { icon } from './icons.js';
import { esc } from './format.js';

export { icon, esc };

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

/* ---------- Snackbar ---------- */

let snackTimer = 0;
export function snack(text, { action, onAction, duration = 5000 } = {}) {
  let el = $('#snackbar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'snackbar';
    el.className = 'snackbar';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.innerHTML = `<span>${esc(text)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  el.classList.add('show');
  clearTimeout(snackTimer);
  const hide = () => el.classList.remove('show');
  if (action) $('button', el).onclick = () => { hide(); onAction?.(); };
  snackTimer = setTimeout(hide, duration);
}

/* ---------- Bottenark ----------
   Öppna ark läggs till i webbläsarens historik så att Androids bakåtknapp stänger arket
   i stället för att lämna sidan. */

const stack = [];
let pendingBack = null;
let pendingResolve = null;

/** Väntar tills ett ark som stängts med knapp har hunnit gå tillbaka i historiken. */
export function afterSheetBack() { return pendingBack || Promise.resolve(); }

/** Anropas av routern vid popstate. true = händelsen kom från att ett ark stängdes. */
export function consumeSheetPop() {
  if (!pendingResolve) return false;
  const r = pendingResolve;
  pendingResolve = null;
  pendingBack = null;
  r();
  return true;
}

function backForSheet() {
  pendingBack = new Promise(r => { pendingResolve = r; });
  history.back();
}

export function closingByBack() {
  // Anropas av routern vid popstate: stänger översta arket om det finns ett.
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close(true);
  return true;
}

/**
 * Öppnar ett bottenark.
 * opts: { title, body (html), actions: [{ label, value, kind: 'primary'|'danger'|'quiet' }], onOpen(el, close) }
 * Returnerar ett Promise som löser med valt value (eller null om arket stängs).
 */
export function sheet({ title = '', body = '', actions = [], onOpen } = {}) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `
      <div class="sheet-backdrop"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="sheet-handle" aria-hidden="true"></div>
        ${title ? `<h2 class="sheet-title">${esc(title)}</h2>` : ''}
        <div class="sheet-body">${body}</div>
        ${actions.length ? `<div class="sheet-actions">${actions.map((a, i) =>
          `<button type="button" class="btn btn-${a.kind || 'quiet'}" data-i="${i}">${a.icon ? icon(a.icon) : ''}${esc(a.label)}</button>`).join('')}</div>` : ''}
      </div>`;
    document.body.append(wrap);
    const prevFocus = document.activeElement;
    let result = null;
    let closed = false;
    let pushed = true;

    const entry = {
      close(fromBack) {
        if (closed) return;
        closed = true;
        stack.splice(stack.indexOf(entry), 1);
        wrap.classList.remove('open');
        wrap.classList.add('closing');
        setTimeout(() => wrap.remove(), 200);
        prevFocus?.focus?.({ preventScroll: true });
        if (!fromBack && pushed) backForSheet();
        resolve(result);
      },
    };
    stack.push(entry);
    afterSheetBack().then(() => { if (!closed) history.pushState({ ...(history.state || {}), sheet: true }, ''); else pushed = false; });

    const close = value => { result = value ?? null; entry.close(false); };
    wrap.querySelector('.sheet-backdrop').onclick = () => close(null);
    wrap.querySelectorAll('.sheet-actions button').forEach(b => {
      b.onclick = () => {
        const a = actions[+b.dataset.i];
        if (a.onClick) { const v = a.onClick(wrap); if (v === false) return; close(v === undefined ? a.value : v); }
        else close(a.value);
      };
    });
    wrap.addEventListener('keydown', e => { if (e.key === 'Escape') close(null); });
    requestAnimationFrame(() => wrap.classList.add('open'));
    onOpen?.(wrap, close);
  });
}

export async function confirmSheet({ title, text, ok = 'OK', danger = false }) {
  const v = await sheet({
    title,
    body: text ? `<p class="sheet-text">${esc(text)}</p>` : '',
    actions: [{ label: 'Avbryt', value: false }, { label: ok, value: true, kind: danger ? 'danger' : 'primary' }],
  });
  return v === true;
}

/** Lista med val (t.ex. meny). items: [{ label, value, icon, danger }] */
export function menuSheet({ title, items }) {
  return sheet({
    title,
    body: `<div class="menu-list">${items.map((it, i) =>
      `<button type="button" class="menu-item${it.danger ? ' danger' : ''}" data-v="${i}">${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span></button>`).join('')}</div>`,
    onOpen(el, close) {
      el.querySelectorAll('.menu-item').forEach(b => { b.onclick = () => close(items[+b.dataset.v].value); });
    },
  });
}

/* ---------- Övrigt ---------- */

export function debounce(fn, ms) {
  let t = 0;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  d.flush = () => { if (t) { clearTimeout(t); t = 0; fn(); } };
  d.cancel = () => { clearTimeout(t); t = 0; };
  return d;
}

export function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
