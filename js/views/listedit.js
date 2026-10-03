// Redigera inköpslista: titel, undertitel, fäst, varor och grupper. Sparar automatiskt.

import { icon, esc, $, $$, sheet, menuSheet, snack, debounce } from '../ui.js';
import { state, updateList, uuid } from '../store.js';
import { emptyState } from '../components.js';
import { back } from '../router.js';
import { enableDragSort } from '../dragsort.js';
import { parseItems } from './lists.js';

export function render(root, [id]) {
  const l = state.lists.get(id);
  if (!l || l.archived) {
    root.innerHTML = `<div class="page">${emptyState({ title: l ? 'Arkiverade listor kan inte ändras' : 'Listan finns inte längre', button: `<a class="btn btn-primary" href="#/listor" data-link>Till inköpslistorna</a>` })}</div>`;
    return;
  }

  const form = { title: l.title, subtitle: l.subtitle, pinned: !!l.pinned };
  // Platt lista med grupprubriker, som i receptredigeringen.
  const rows = [];
  let cur = '';
  for (const it of l.items) {
    const g = (it.group || '').trim();
    if (g !== cur) { rows.push({ kind: 'group', id: uuid(), name: g }); cur = g; }
    rows.push({ kind: 'item', ...it });
  }

  root.innerHTML = `
    <div class="appbar appbar-edit">
      <button type="button" class="icon-btn" data-action="back" aria-label="Tillbaka">${icon('chevron-left')}</button>
      <span class="saved" id="saved" aria-live="polite"></span>
      <span class="spacer"></span>
      <button type="button" class="btn btn-primary btn-small" data-action="back">${icon('check')}Klar</button>
    </div>
    <div class="page edit">
      <label class="sr-only" for="lf-title">Titel</label>
      <input id="lf-title" class="title-input" type="text" value="${esc(form.title)}" placeholder="Listans titel" data-f="title" autocomplete="off">
      <label class="field"><span class="field-label">Undertitel <span class="opt">(valfritt)</span></span>
        <input id="lf-sub" class="input input-italic" type="text" value="${esc(form.subtitle)}" placeholder="t.ex. Helgmiddag, lördag" data-f="subtitle" autocomplete="off"></label>
      <label class="check-row"><input type="checkbox" id="lf-pin" ${form.pinned ? 'checked' : ''}>
        <span><b>Fäst listan</b><br><span class="muted">Fäst listan och fäst enskilda varor (via ⋮) som ska ligga kvar när listan arkiveras.</span></span></label>

      <section class="ed-section">
        <h2 class="ed-heading">Varor</h2>
        <div class="ed-list" id="item-list"></div>
        <div class="ed-add">
          <button type="button" class="btn btn-quiet btn-small" data-action="add-item">${icon('plus')}Vara</button>
          <button type="button" class="btn btn-quiet btn-small" data-action="add-group">${icon('plus')}Grupp</button>
          <button type="button" class="btn btn-quiet btn-small" data-action="paste">${icon('clipboard-paste')}Klistra in</button>
        </div>
        <p class="ed-hint">Håll fingret på ${icon('ellipsis-vertical', 'inline-icon')} och dra för att flytta en rad.</p>
      </section>
    </div>`;

  const listEl = $('#item-list', root);
  const savedEl = $('#saved', root);

  const save = debounce(() => {
    const items = [];
    let group = '';
    for (const r of rows) {
      if (r.kind === 'group') { group = r.name.trim(); continue; }
      if (!r.text.trim()) continue;
      const { kind, ...it } = r;
      items.push({ ...it, text: r.text.trim(), group: group || undefined });
    }
    updateList(id, { title: form.title.trim(), subtitle: form.subtitle.trim(), pinned: form.pinned, items });
    savedEl.innerHTML = `${icon('check')}Sparat`;
  }, 400);
  const changed = () => { savedEl.textContent = 'Sparar…'; save(); };

  const menuBtn = i => `<button type="button" class="icon-btn ed-menu" data-op="menu" data-i="${i}" aria-label="Flytta, fäst eller ta bort">${icon('ellipsis-vertical')}</button>`;
  function draw() {
    listEl.innerHTML = rows.length ? rows.map((r, i) => r.kind === 'group' ? `
      <div class="ed-row ed-group" data-i="${i}">
        <input class="input ed-group-name" type="text" value="${esc(r.name)}" placeholder="Gruppnamn, t.ex. Mejeri" data-k="name" aria-label="Gruppnamn">
        ${menuBtn(i)}
      </div>` : `
      <div class="ed-row ed-li" data-i="${i}">
        <input class="input" type="text" value="${esc(r.text)}" placeholder="t.ex. 2 l mjölk" data-k="text" aria-label="Vara" autocomplete="off" enterkeyhint="next">
        <span class="keep-icon" ${form.pinned && r.keep ? 'title="Fäst vara"' : 'aria-hidden="true"'}>${form.pinned && r.keep ? icon('pin') : ''}</span>
        ${menuBtn(i)}
      </div>`).join('') : '<p class="ed-empty">Inga varor än.</p>';
  }
  draw();

  const focusRow = (i, sel = 'input') => requestAnimationFrame(() => $(`.ed-row[data-i="${i}"] ${sel}`, listEl)?.focus());
  const newItem = () => ({ kind: 'item', id: uuid(), text: '', checked: false });

  enableDragSort(listEl, {
    rowSel: '.ed-row', handleSel: '.ed-menu',
    onMove(from, to) { const [r] = rows.splice(from, 1); rows.splice(to, 0, r); draw(); changed(); },
  });

  root.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.f) { form[el.dataset.f] = el.value; changed(); return; }
    const row = el.closest('.ed-row');
    if (!row || !el.dataset.k) return;
    rows[+row.dataset.i][el.dataset.k] = el.value;
    changed();
  });
  $('#lf-pin', root).addEventListener('change', e => { form.pinned = e.target.checked; draw(); changed(); });

  listEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    const row = e.target.closest('.ed-row');
    if (!row) return;
    e.preventDefault();
    const i = +row.dataset.i;
    rows.splice(i + 1, 0, newItem());
    draw(); focusRow(i + 1); changed();
  });

  root.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action], [data-op]');
    if (!btn) return;
    const a = btn.dataset.action;
    if (a === 'back') { save.flush(); back(`/lista/${id}`); return; }
    if (a === 'add-item') { rows.push(newItem()); draw(); focusRow(rows.length - 1); changed(); }
    else if (a === 'add-group') { rows.push({ kind: 'group', id: uuid(), name: '' }); draw(); focusRow(rows.length - 1); changed(); }
    else if (a === 'paste') {
      const text = await sheet({
        title: 'Klistra in varor',
        body: `<p class="sheet-text">En vara per rad. En rad som slutar med kolon blir en grupp, t.ex. <b>Mejeri:</b></p>
          <textarea id="paste-text" class="input paste-area" rows="8" aria-label="Varor"></textarea>`,
        actions: [{ label: 'Avbryt', value: null }, { label: 'Lägg till', kind: 'primary', onClick: el => el.querySelector('#paste-text').value.trim() || null }],
        onOpen(el) { setTimeout(() => el.querySelector('#paste-text').focus(), 50); },
      });
      if (!text) return;
      let group = null;
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        if (/:$/.test(t) && t.length < 40) { group = t.slice(0, -1).trim(); rows.push({ kind: 'group', id: uuid(), name: group }); continue; }
        const { items } = parseItems(t);
        for (const it of items) rows.push({ kind: 'item', ...it });
      }
      draw(); changed();
    } else if (btn.dataset.op === 'menu') {
      const i = +btn.dataset.i;
      const r = rows[i];
      const choice = await menuSheet({
        title: r.kind === 'group' ? (r.name || 'Grupp') : (r.text || 'Vara'),
        items: [
          ...(i > 0 ? [{ label: 'Flytta upp', value: 'up', icon: 'arrow-up' }] : []),
          ...(i < rows.length - 1 ? [{ label: 'Flytta ned', value: 'down', icon: 'arrow-down' }] : []),
          ...(r.kind === 'item' && form.pinned ? [{ label: r.keep ? 'Lossa varan' : 'Fäst varan (blir kvar vid arkivering)', value: 'keep', icon: r.keep ? 'pin-off' : 'pin' }] : []),
          { label: 'Ta bort', value: 'del', icon: 'trash', danger: true },
        ],
      });
      if (!choice) return;
      if (choice === 'up' || choice === 'down') { const j = choice === 'up' ? i - 1 : i + 1; [rows[i], rows[j]] = [rows[j], rows[i]]; }
      else if (choice === 'keep') r.keep = !r.keep;
      else if (choice === 'del') {
        const [removed] = rows.splice(i, 1);
        snack('Raden togs bort', { action: 'Ångra', onAction: () => { rows.splice(i, 0, removed); draw(); changed(); } });
      }
      draw(); changed();
    }
  });

  return () => save.flush();
}
