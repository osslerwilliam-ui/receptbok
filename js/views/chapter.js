// Kapitelvy: recept i kapitlet, nytt recept, byt namn och ta bort kapitel.

import { icon, esc, $, menuSheet, confirmSheet, snack } from '../ui.js';
import { state, recipesInChapter, createRecipe, updateChapter, deleteChapter, NO_CHAPTER } from '../store.js';
import { recipeRow, chapterSheet, pickChapterSheet, emptyState, colorVar } from '../components.js';
import { navigate, back } from '../router.js';

export function render(root, [id]) {
  const isNone = id === NO_CHAPTER;
  const ch = isNone ? { id, name: 'Utan kapitel', emoji: '📄' } : state.chapters.get(id);
  if (!ch) {
    root.innerHTML = `<div class="page">${emptyState({ title: 'Kapitlet finns inte längre', button: `<a class="btn btn-primary" href="#/" data-link>Till startsidan</a>` })}</div>`;
    return;
  }

  const draw = () => {
    const recipes = recipesInChapter(id);
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
        ${recipes.length
          ? `<div class="rlist">${recipes.map(r => recipeRow(r, { sub: r.tags?.length ? esc(r.tags.join(' · ')) : '' })).join('')}</div>`
          : emptyState({ title: 'Inga recept här än', text: 'Lägg till ditt första recept i kapitlet.', icon: 'book-open' })}
      </div>
      <div class="bottom-bar"><button type="button" class="btn btn-primary btn-wide" data-action="new-recipe">${icon('plus')}Nytt recept</button></div>`;
  };
  draw();

  root.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const a = btn.dataset.action;
    if (a === 'back') back();
    else if (a === 'new-recipe') {
      const r = createRecipe({ chapterId: isNone ? null : id });
      navigate(`/recept/${r.id}/redigera`);
    } else if (a === 'menu') {
      const choice = await menuSheet({
        title: ch.name,
        items: [
          { label: 'Ändra namn, ikon och färg', value: 'edit', icon: 'pencil' },
          { label: 'Ta bort kapitel', value: 'delete', icon: 'trash', danger: true },
        ],
      });
      if (choice === 'edit') {
        const v = await chapterSheet(ch);
        if (v) { updateChapter(id, v); Object.assign(ch, state.chapters.get(id)); draw(); }
      } else if (choice === 'delete') {
        await removeChapter(ch);
      }
    }
  });
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
