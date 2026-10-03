// Inköpslistor: översikt (fästa, övriga, arkiv) och handla-läget där man stryker över varor.

import { icon, esc, $, $$, sheet, menuSheet, confirmSheet, snack } from '../ui.js';
import { state, onChange, listsActive, listsArchived, createList, updateList, deleteList, restoreList, archiveList, reorderLists, uuid } from '../store.js';
import { enableGridSort } from '../gridsort.js';
import { fmtDate, groupItems, parseStepLines, UNITS } from '../format.js';
import { emptyState } from '../components.js';
import { navigate, back } from '../router.js';
import { shareList } from '../share.js';
import * as wakelock from '../wakelock.js';

let archiveOpen = false;

export function render(root, params, ctx, { view }) {
  if (view === 'lists') return renderHome(root);
  return renderList(root, params[0]);
}

/* ---------- Gemensamt ---------- */

const remaining = l => l.items.filter(i => !i.checked).length;

/** "2 l mjölk" → mängden i fetstil. */
const UNIT_SET = new Set(UNITS);
export function itemHtml(text) {
  const m = text.match(/^((?:ca\.?\s*)?[\d½¼¾⅓⅔]+(?:[.,/-]\d+)?)\s*([a-zåäö]+\.?)?\s+(.+)$/i);
  if (!m) return esc(text);
  const unit = m[2] && UNIT_SET.has(m[2].toLowerCase().replace(/\.$/, '')) ? m[2] : '';
  const rest = unit ? m[3] : [m[2], m[3]].filter(Boolean).join(' ');
  return `<span class="li-amt">${esc(m[1])}${unit ? ' ' + esc(unit) : ''}</span> ${esc(rest)}`;
}

/** Textrader → varor. Rader som slutar med kolon blir grupper. */
export function parseItems(text, startGroup = '') {
  let group = startGroup;
  const out = [];
  for (const p of parseStepLines(text)) {
    if (p.group != null) { group = p.group; continue; }
    out.push({ id: uuid(), text: p.text, checked: false, ...(group ? { group } : {}) });
  }
  return { items: out, group };
}

export function listSheet(cur = null) {
  return sheet({
    title: cur ? 'Ändra lista' : 'Ny inköpslista',
    body: `
      <label class="field"><span class="field-label">Titel</span>
        <input id="ls-title" class="input" type="text" maxlength="60" value="${esc(cur?.title || '')}" placeholder="t.ex. Veckohandling" autocomplete="off" enterkeyhint="next"></label>
      <label class="field"><span class="field-label">Undertitel <span class="opt">(valfritt)</span></span>
        <input id="ls-sub" class="input input-italic" type="text" maxlength="80" value="${esc(cur?.subtitle || '')}" placeholder="t.ex. Helgmiddag, lördag" autocomplete="off" enterkeyhint="done"></label>
      <label class="check-row"><input type="checkbox" id="ls-pin" ${cur?.pinned ? 'checked' : ''}>
        <span><b>Fäst listan</b><br><span class="muted">Ligger överst. Vid arkivering sparas en kopia och listan töms.</span></span></label>
      <p class="field-error" id="ls-err" hidden>Skriv en titel på listan.</p>`,
    actions: [
      { label: 'Avbryt', value: null },
      {
        label: cur ? 'Spara' : 'Skapa lista', kind: 'primary', onClick(el) {
          const title = el.querySelector('#ls-title').value.trim();
          if (!title) { el.querySelector('#ls-err').hidden = false; return false; }
          return { title, subtitle: el.querySelector('#ls-sub').value.trim(), pinned: el.querySelector('#ls-pin').checked };
        },
      },
    ],
    onOpen(el) {
      el.querySelector('#ls-title').addEventListener('keydown', e => { if (e.key === 'Enter') el.querySelector('#ls-sub').focus(); });
      el.querySelector('#ls-sub').addEventListener('keydown', e => { if (e.key === 'Enter') el.querySelector('.sheet-actions .btn-primary').click(); });
      if (!cur) setTimeout(() => el.querySelector('#ls-title').focus(), 60);
    },
  });
}

/* ---------- Översikt ---------- */

/** Början av listan i liten text (som i Google Keep): de första varorna som är kvar. */
const PEEK = 4;
function peek(l) {
  const left = l.items.filter(i => !i.checked);
  if (!left.length) return '';
  return `<span class="list-peek">${left.slice(0, PEEK).map(i => `<span>${esc(i.text)}</span>`).join('')}${left.length > PEEK ? '<span>…</span>' : ''}</span>`;
}

function listCard(l) {
  const left = remaining(l);
  const total = l.items.length;
  const done = total ? (total - left) / total : 0;
  return `<a class="list-card${l.pinned ? ' pinned' : ''}" href="#/lista/${l.id}" data-link data-list="${l.id}" data-id="${l.id}">
    <span class="list-title">${esc(l.title || 'Namnlös lista')}</span>
    ${l.subtitle ? `<span class="list-sub">${esc(l.subtitle)}</span>` : ''}
    ${peek(l)}
    <span class="list-progress"><span style="width:${Math.round(done * 100)}%"></span></span>
    <span class="list-count">${!total ? 'Tom lista' : left ? `${left} kvar av ${total}` : 'Allt handlat'}</span>
  </a>`;
}

function renderHome(root) {
  const draw = () => {
    const active = listsActive();
    const pinned = active.filter(l => l.pinned);
    const others = active.filter(l => !l.pinned);
    const archived = listsArchived();
    root.innerHTML = `
      <div class="appbar">
        <button type="button" class="icon-btn" data-action="back" aria-label="Till receptboken">${icon('chevron-left')}</button>
      </div>
      <div class="page lists-home">
        <header class="page-head"><h1 class="wordmark">Inköps<em>listor</em></h1></header>
        ${!active.length && !archived.length ? emptyState({
          title: 'Inga inköpslistor än',
          text: 'Skapa en lista och lägg till varor – sedan stryker du över dem i affären.',
          button: `<button type="button" class="btn btn-primary" data-action="new-list">${icon('plus')}Ny inköpslista</button>`,
          icon: 'clipboard-list',
        }) : `
          ${pinned.length ? `<h2 class="section-title">${icon('pin', 'inline-icon')} Fästa</h2><div class="list-grid">${pinned.map(listCard).join('')}</div>` : ''}
          <h2 class="section-title">Listor</h2>
          <div class="list-grid">
            ${others.map(listCard).join('')}
            <button type="button" class="list-card add" data-action="new-list">${icon('plus')}<span>Ny lista</span></button>
          </div>
          ${archived.length ? `<details class="recent archive" ${archiveOpen ? 'open' : ''}>
            <summary class="section-title">${icon('archive', 'inline-icon')} Arkiv · ${archived.length}<span class="recent-chev">${icon('chevron-down')}</span></summary>
            <div class="archive-list">${archived.map(l => `
              <a class="archive-row" href="#/lista/${l.id}" data-link>
                <span class="archive-title">${esc(l.title || 'Namnlös lista')}${l.subtitle ? ` <i>${esc(l.subtitle)}</i>` : ''}</span>
                <span class="archive-date">${esc(fmtDate(l.archivedAt))}</span>
              </a>`).join('')}</div>
          </details>` : ''}`}
      </div>`;
    root.querySelector('.archive')?.addEventListener('toggle', e => { archiveOpen = e.target.open; });
  };
  draw();
  const off = onChange(() => { if (root.isConnected) draw(); });
  // Håll fingret på en lista och dra den till ny plats (fästa och övriga var för sig).
  const stopSort = enableGridSort(root, {
    gridSel: '.list-grid', itemSel: '.list-card[data-list]',
    onDrop(grid, ids) {
      const moved = new Set(ids);
      reorderLists([...ids, ...listsActive().filter(l => !moved.has(l.id)).map(l => l.id)]);
    },
  });
  root.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'back') back('/');
    else if (btn.dataset.action === 'new-list') {
      const v = await listSheet();
      if (v) { const l = createList(v); navigate(`/lista/${l.id}/redigera`); } // börja med att lägga in varor
    }
  });
  return () => { off(); stopSort(); };
}

/* ---------- Handla-läget ---------- */

function renderList(root, id) {
  const draw = () => {
    const l = state.lists.get(id);
    if (!l) {
      root.innerHTML = `<div class="page">${emptyState({ title: 'Listan finns inte längre', button: `<a class="btn btn-primary" href="#/listor" data-link>Till inköpslistorna</a>` })}</div>`;
      return;
    }
    const left = remaining(l);
    const total = l.items.length;
    root.innerHTML = `
      ${l.archived ? '' : `<div class="awake awake-quiet" id="awake">${icon('sun')}<span id="awake-text">Skärmen hålls tänd</span></div>`}
      <div class="appbar">
        <button type="button" class="icon-btn" data-action="back" aria-label="Tillbaka">${icon('chevron-left')}</button>
        <span class="spacer"></span>
        ${total ? `<button type="button" class="icon-btn" data-action="share" aria-label="Dela listan">${icon('share-2')}</button>` : ''}
        <button type="button" class="icon-btn" data-action="menu" aria-label="Meny">${icon('ellipsis-vertical')}</button>
      </div>
      <article class="page shop${l.archived ? ' archived' : ''}">
        <header class="shop-head">
          ${l.archived ? `<span class="badge badge-quiet">${icon('archive')}Arkiverad ${esc(fmtDate(l.archivedAt))}</span>` : l.pinned ? `<span class="badge badge-quiet">${icon('pin')}Fäst lista</span>` : ''}
          <h1 class="shop-title">${esc(l.title || 'Namnlös lista')}</h1>
          ${l.subtitle ? `<p class="shop-sub">${esc(l.subtitle)}</p>` : ''}
          ${total ? `<p class="shop-count">${left ? `<b>${left}</b> kvar av ${total}` : 'Allt är handlat'}</p>` : ''}
        </header>
        ${total ? groupItems(l.items).map(g => `
          ${g.name ? `<h2 class="shop-group">${esc(g.name)}</h2>` : ''}
          <ul class="shop-items">${g.items.map(i => `
            <li class="shop-item${i.checked ? ' done' : ''}" data-id="${i.id}" role="checkbox" aria-checked="${!!i.checked}" tabindex="0">
              <span class="shop-text">${itemHtml(i.text)}</span>
              ${l.pinned && i.keep ? `<span class="keep-icon" title="Fäst vara">${icon('pin')}</span>` : ''}
            </li>`).join('')}</ul>`).join('') : `<p class="muted shop-empty">${l.archived ? 'Listan var tom.' : 'Listan är tom. Tryck på Redigera lista för att lägga till varor.'}</p>`}
        ${l.archived ? `
          <div class="shop-actions">
            <button type="button" class="btn btn-primary" data-action="restore">${icon('archive-restore')}Återställ listan</button>
            <button type="button" class="btn btn-quiet" data-action="copy">${icon('copy')}Använd som ny lista</button>
          </div>` : `
          ${total && !left ? `<div class="shop-actions"><button type="button" class="btn btn-primary btn-wide" data-action="archive">${icon('archive')}Arkivera listan</button></div>` : ''}
          <div class="shop-actions"><a class="btn btn-quiet btn-wide" href="#/lista/${l.id}/redigera" data-link>${icon('pencil')}Redigera lista</a></div>`}
      </article>`;
  };

  draw();
  const off = onChange(() => { if (root.isConnected) draw(); });

  const toggle = li => {
    const l = state.lists.get(id);
    if (!l || l.archived) return;
    updateList(id, { items: l.items.map(i => i.id === li.dataset.id ? { ...i, checked: !i.checked } : i) });
  };

  root.addEventListener('keydown', e => {
    const li = e.target.closest?.('.shop-item');
    if (li && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); toggle(li); }
  });

  root.addEventListener('click', async e => {
    const li = e.target.closest('.shop-item');
    if (li) { toggle(li); return; }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const a = btn.dataset.action;
    const l = state.lists.get(id);
    if (a === 'back') back('/listor');
    else if (a === 'menu') listMenu(id);
    else if (a === 'share') shareList(l);
    else if (a === 'archive') archiveFlow(id);
    else if (a === 'restore') { updateList(id, { archived: false, archivedAt: null }); snack('Listan är återställd'); }
    else if (a === 'copy') {
      const n = createList({ title: l.title, subtitle: l.subtitle, items: l.items.map(i => ({ ...i, id: uuid(), checked: false })) });
      navigate(`/lista/${n.id}`, { replace: true });
      snack('En ny lista skapades från arkivet');
    }
  });

  // Skärmen hålls tänd medan man handlar.
  const l0 = state.lists.get(id);
  if (l0 && !l0.archived) {
    const setState = on => {
      const el = $('#awake', root);
      if (!el) return;
      el.classList.toggle('off', !on);
      $('#awake-text', root).textContent = on ? 'Skärmen hålls tänd' : 'Skärmen kan släckas';
    };
    wakelock.enable(setState).then(setState);
    return () => { off(); wakelock.disable(); };
  }
  return off;
}

async function listMenu(id) {
  const l = state.lists.get(id);
  if (!l) return;
  const anyChecked = l.items.some(i => i.checked);
  const items = l.archived ? [
    { label: 'Återställ listan', value: 'restore', icon: 'archive-restore' },
    { label: 'Ta bort från arkivet', value: 'delete', icon: 'trash', danger: true },
  ] : [
    { label: 'Redigera', value: 'edit', icon: 'pencil' },
    { label: l.pinned ? 'Lossa listan' : 'Fäst listan', value: 'pin', icon: l.pinned ? 'pin-off' : 'pin' },
    ...(anyChecked ? [{ label: 'Avmarkera alla', value: 'uncheck', icon: 'rotate-ccw' }] : []),
    { label: 'Arkivera', value: 'archive', icon: 'archive' },
    { label: 'Ta bort listan', value: 'delete', icon: 'trash', danger: true },
  ];
  const choice = await menuSheet({ title: l.title || 'Lista', items });
  if (choice === 'edit') navigate(`/lista/${id}/redigera`);
  else if (choice === 'pin') { updateList(id, { pinned: !l.pinned }); snack(l.pinned ? 'Listan är inte längre fäst' : 'Listan är fäst'); }
  else if (choice === 'uncheck') {
    const before = l.items;
    updateList(id, { items: l.items.map(i => ({ ...i, checked: false })) });
    snack('Alla varor avmarkerade', { action: 'Ångra', onAction: () => updateList(id, { items: before }) });
  } else if (choice === 'archive') archiveFlow(id);
  else if (choice === 'restore') { updateList(id, { archived: false, archivedAt: null }); snack('Listan är återställd'); }
  else if (choice === 'delete') {
    if (!await confirmSheet({ title: `Ta bort ”${l.title || 'listan'}”?`, ok: 'Ta bort', danger: true })) return;
    const removed = deleteList(id);
    await back('/listor');
    snack('Listan togs bort', { action: 'Ångra', onAction: () => restoreList(removed) });
  }
}

async function archiveFlow(id) {
  const l = state.lists.get(id);
  if (!l) return;
  const kept = l.items.filter(i => i.keep).length;
  const ok = await confirmSheet({
    title: 'Arkivera listan?',
    text: l.pinned
      ? `En kopia av listan sparas i arkivet. Den fästa listan blir kvar med titel och undertitel${kept ? ` och ${kept} fäst${kept === 1 ? '' : 'a'} ${kept === 1 ? 'vara' : 'varor'}` : ''} – övriga varor tas bort.`
      : 'Listan markeras som klar och flyttas till arkivet längst ner på listsidan.',
    ok: 'Arkivera',
  });
  if (!ok) return;
  const res = archiveList(id);
  if (!l.pinned) await back('/listor');
  snack(l.pinned ? 'En kopia sparades i arkivet' : 'Listan är arkiverad', { action: 'Ångra', duration: 8000, onAction: () => res.undo() });
}
