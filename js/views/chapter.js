// Kapitelvy: recept i kapitlet (först de utan grupp, sedan grupperna), nytt recept,
// grupper, byt namn och ta bort kapitel.

import { icon, esc, $, sheet, menuSheet, confirmSheet, snack } from '../ui.js';
import {
  state, onChange, recipesInChapter, createRecipe, updateChapter, deleteChapter, NO_CHAPTER, updateRecipe, displayTitle,
  groupsOf, createGroup, updateGroup, reorderGroups, deleteGroup, restore,
} from '../store.js';
import { recipeRow, chapterSheet, pickChapterSheet, emptyState, colorVar } from '../components.js';
import { enableGridSort } from '../gridsort.js';
import { enableDragToTarget } from '../dragdrop.js';
import { navigate, back } from '../router.js';

export function render(root, [id]) {
  const isNone = id === NO_CHAPTER;
  let ch = isNone ? { id, name: 'Utan kapitel', emoji: '📄' } : state.chapters.get(id);
  if (!ch) {
    root.innerHTML = `<div class="page">${emptyState({ title: 'Kapitlet finns inte längre', button: `<a class="btn btn-primary" href="#/" data-link>Till startsidan</a>` })}</div>`;
    return;
  }

  const row = r => recipeRow(r, { sub: r.tags?.length ? esc(r.tags.join(' · ')) : '' });

  const draw = () => {
    if (!isNone && !state.chapters.has(id)) return;
    if (!isNone) ch = state.chapters.get(id); // aldrig ändra i det sparade objektet (behövs för Ångra)
    const recipes = recipesInChapter(id);
    const groups = isNone ? [] : groupsOf(id);
    const gIds = new Set(groups.map(g => g.id));
    const loose = recipes.filter(r => !gIds.has(r.groupId));
    const inGroup = gid => recipes.filter(r => r.groupId === gid);
    root.innerHTML = `
      <div class="appbar">
        <button type="button" class="icon-btn" data-action="back" aria-label="Tillbaka">${icon('chevron-left')}</button>
        <span class="spacer"></span>
        ${isNone ? '' : `<button type="button" class="icon-btn" data-action="menu" aria-label="Kapitelmeny">${icon('ellipsis-vertical')}</button>`}
      </div>
      <div class="page chapter-page" style="--c: ${isNone ? 'var(--ch-lera)' : colorVar(ch)}">
        <header class="page-head">
          ${ch.emoji ? `<span class="page-emoji" aria-hidden="true">${esc(ch.emoji)}</span>` : ''}
          <h1 class="page-title">${esc(ch.name)}</h1>
          <p class="page-sub">${recipes.length} recept</p>
        </header>
        ${!recipes.length && !groups.length
          ? emptyState({ title: 'Inga recept här än', text: 'Lägg till ditt första recept i kapitlet.', icon: 'book-open' })
          : `${groups.length
            ? `<div class="loose-zone" data-group=""><p class="drop-label">Utan grupp</p>${loose.length ? `<div class="rlist">${loose.map(row).join('')}</div>` : ''}</div>`
            : loose.length ? `<div class="rlist">${loose.map(row).join('')}</div>` : ''}
            ${groups.length ? `<div class="cgroups">${groups.map(g => {
              const list = inGroup(g.id);
              return `<section class="cgroup${g.collapsed ? ' collapsed' : ''}" data-id="${g.id}">
                <div class="cgroup-head">
                  <button type="button" class="cgroup-toggle" data-action="toggle-group" data-group="${g.id}" aria-expanded="${!g.collapsed}">
                    <span class="cgroup-name">${esc(g.name)}</span>
                    <span class="cgroup-count">${list.length}</span>
                    ${icon('chevron-down', 'cgroup-chev')}
                  </button>
                  <button type="button" class="icon-btn" data-action="group-menu" data-group="${g.id}" aria-label="Meny för gruppen ${esc(g.name)}">${icon('ellipsis-vertical')}</button>
                </div>
                ${g.collapsed ? '' : list.length
                  ? `<div class="rlist">${list.map(row).join('')}</div>`
                  : `<p class="cgroup-empty">Inga recept i gruppen än. Håll fingret på ett recept och dra det hit, eller tryck på ${icon('ellipsis-vertical', 'inline-icon')} → <i>Nytt recept i gruppen</i>.</p>`}
              </section>`;
            }).join('')}</div>` : ''}`}
      </div>
      <div class="bottom-bar"><button type="button" class="btn btn-primary btn-wide" data-action="new-recipe">${icon('plus')}Nytt recept</button></div>`;
  };
  draw();
  const off = onChange(() => { if (root.isConnected) draw(); });

  // Håll fingret på en grupps rubrik och dra den till ny plats.
  const stopSort = isNone ? () => {} : enableGridSort(root, {
    gridSel: '.cgroups', itemSel: '.cgroup', handleSel: '.cgroup-head',
    onDrop(_grid, ids) { reorderGroups(id, ids); },
  });

  // Håll fingret på ett recept och dra det till en grupp (eller till "Utan grupp").
  const stopDrop = isNone ? () => {} : enableDragToTarget(root, {
    itemSel: '.rrow[data-recipe]', targetSel: '.cgroup, .loose-zone',
    canStart: () => groupsOf(id).length > 0,
    onDrop(item, target) {
      const r = state.recipes.get(item.dataset.recipe);
      const gid = target.classList.contains('cgroup') ? target.dataset.id : null;
      if (!r || (r.groupId || null) === gid) return;
      updateRecipe(r.id, { groupId: gid });
      const g = gid && groupsOf(id).find(x => x.id === gid);
      snack(g ? `”${displayTitle(r)}” lades i ${g.name}` : `”${displayTitle(r)}” är inte längre i någon grupp`, {
        action: 'Ångra', onAction: () => updateRecipe(r.id, { groupId: r.groupId || null }),
      });
    },
  });

  root.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const a = btn.dataset.action;
    const gid = btn.dataset.group;
    if (a === 'back') back();
    else if (a === 'new-recipe') {
      const r = createRecipe({ chapterId: isNone ? null : id });
      navigate(`/recept/${r.id}/redigera`);
    } else if (a === 'toggle-group') {
      const g = groupsOf(id).find(x => x.id === gid);
      if (g) updateGroup(id, gid, { collapsed: !g.collapsed });
    } else if (a === 'group-menu') {
      groupMenu(id, gid);
    } else if (a === 'menu') {
      const choice = await menuSheet({
        title: ch.name,
        items: [
          { label: 'Ny grupp', value: 'new-group', icon: 'folder-plus' },
          { label: 'Ändra namn, ikon och färg', value: 'edit', icon: 'pencil' },
          { label: 'Ta bort kapitel', value: 'delete', icon: 'trash', danger: true },
        ],
      });
      if (choice === 'new-group') {
        const name = await groupNameSheet();
        if (name) { createGroup(id, name); snack(`Gruppen ”${name}” skapades`); }
      } else if (choice === 'edit') {
        const v = await chapterSheet(ch);
        if (v) updateChapter(id, v);
      } else if (choice === 'delete') {
        await removeChapter(ch);
      }
    }
  });
  return () => { off(); stopSort(); stopDrop(); };
}

/** Dialog för gruppens namn. Returnerar namnet eller null. */
export function groupNameSheet(cur = '') {
  return sheet({
    title: cur ? 'Byt namn på grupp' : 'Ny grupp',
    body: `${cur ? '' : '<p class="sheet-text">En grupp samlar recept inom kapitlet, t.ex. Surdeg i Bröd. Gruppen kan fällas ihop.</p>'}
      <label class="field"><span class="field-label">Namn</span>
        <input id="grp-name" class="input" type="text" maxlength="40" value="${esc(cur)}" placeholder="t.ex. Surdeg" autocomplete="off" enterkeyhint="done"></label>
      <p class="field-error" id="grp-err" hidden>Skriv ett namn på gruppen.</p>`,
    actions: [
      { label: 'Avbryt', value: null },
      {
        label: cur ? 'Spara' : 'Skapa grupp', kind: 'primary', onClick(el) {
          const name = el.querySelector('#grp-name').value.trim();
          if (!name) { el.querySelector('#grp-err').hidden = false; return false; }
          return name;
        },
      },
    ],
    onOpen(el) {
      const input = el.querySelector('#grp-name');
      input.addEventListener('keydown', e => { if (e.key === 'Enter') el.querySelector('.sheet-actions .btn-primary').click(); });
      setTimeout(() => (cur ? input.select() : input.focus()), 60);
    },
  });
}

async function groupMenu(chapterId, gid) {
  const g = groupsOf(chapterId).find(x => x.id === gid);
  if (!g) return;
  const choice = await menuSheet({
    title: g.name,
    items: [
      { label: 'Nytt recept i gruppen', value: 'new', icon: 'plus' },
      { label: 'Byt namn', value: 'rename', icon: 'pencil' },
      { label: 'Ta bort gruppen', value: 'delete', icon: 'trash', danger: true },
    ],
  });
  if (choice === 'new') {
    const r = createRecipe({ chapterId, groupId: gid });
    navigate(`/recept/${r.id}/redigera`);
  } else if (choice === 'rename') {
    const name = await groupNameSheet(g.name);
    if (name) updateGroup(chapterId, gid, { name });
  } else if (choice === 'delete') {
    const removed = deleteGroup(chapterId, gid);
    const n = removed.recipes.length;
    snack(n ? `Gruppen togs bort – ${n} recept ligger kvar i kapitlet` : 'Gruppen togs bort', { action: 'Ångra', duration: 8000, onAction: () => restore(removed) });
  }
}

async function removeChapter(ch) {
  const recipes = recipesInChapter(ch.id);
  if (!recipes.length) {
    if (!await confirmSheet({ title: `Ta bort ”${ch.name}”?`, text: 'Kapitlet är tomt.', ok: 'Ta bort', danger: true })) return;
    deleteChapter(ch.id);
    snack(`Kapitlet ”${ch.name}” togs bort`);
    back();
    return;
  }
  const target = await pickChapterSheet({
    title: `Vart ska ${recipes.length} recept flyttas?`,
    exclude: ch.id,
  });
  if (!target) return;
  const targetName = target === NO_CHAPTER ? 'Utan kapitel' : state.chapters.get(target).name;
  if (!await confirmSheet({
    title: `Ta bort ”${ch.name}”?`,
    text: `${recipes.length} recept flyttas till ”${targetName}”. Inga recept tas bort.`,
    ok: 'Flytta och ta bort', danger: true,
  })) return;
  deleteChapter(ch.id, target === NO_CHAPTER ? null : target);
  snack(`Kapitlet togs bort och recepten flyttades till ”${targetName}”`);
  back();
}
