// Receptvy och kokläge.

import { icon, esc, $, $$, menuSheet, confirmSheet, snack } from '../ui.js';
import { bundle, chapterOf, displayTitle, markViewed, updateRecipe, deleteRecipe, restore, NO_CHAPTER, state } from '../store.js';
import { fmtAmount, groupItems } from '../format.js';
import { colorVar, pickChapterSheet, emptyState } from '../components.js';
import { navigate, back } from '../router.js';
import { shareRecipe } from '../share.js';
import * as wakelock from '../wakelock.js';

// Tillfälligt läge per recept (flik och avbockningar). Sparas inte.
const temp = new Map();
const tempFor = id => {
  if (!temp.has(id)) temp.set(id, { tab: 'ing', ing: new Set(), steps: new Set() });
  return temp.get(id);
};

export function render(root, [id], ctx, { cook = false } = {}) {
  const b = bundle(id);
  if (!b) {
    root.innerHTML = `<div class="page">${emptyState({ title: 'Receptet finns inte längre', text: 'Det kan ha tagits bort.', button: `<a class="btn btn-primary" href="#/" data-link>Till startsidan</a>` })}</div>`;
    return;
  }
  const { recipe, version } = b;
  const t = tempFor(id);
  if (!cook) markViewed(id);

  const ch = chapterOf(recipe);
  const dev = b.variant.status === 'development';
  const ingredients = version.ingredients;
  const steps = version.steps;

  root.innerHTML = `
    ${cook ? `<div class="awake" id="awake">${icon('sun')}<span id="awake-text">Skärmen hålls tänd</span><span class="pulse"></span></div>` : ''}
    <div class="appbar">
      <button type="button" class="icon-btn" data-action="back" aria-label="${cook ? 'Stäng kokläge' : 'Tillbaka'}">${icon(cook ? 'x' : 'chevron-left')}</button>
      <span class="spacer"></span>
      ${cook ? '' : `
        <button type="button" class="icon-btn" data-action="share" aria-label="Dela">${icon('share-2')}</button>
        <button type="button" class="icon-btn" data-action="menu" aria-label="Meny">${icon('ellipsis-vertical')}</button>`}
    </div>
    <article class="recipe${dev ? ' is-dev' : ''}${cook ? ' cook' : ''}">
      <header class="recipe-head">
        <a class="kicker" ${ch ? `href="#/kapitel/${ch.id}"` : `href="#/kapitel/${NO_CHAPTER}"`} data-link style="--c: ${colorVar(ch)}">
          ${ch ? `${esc(ch.emoji || '')} ${esc(ch.name)}` : 'Utan kapitel'}</a>
        ${dev ? `<span class="badge">${icon('flask-conical')}Under utveckling · v${version.number}</span>` : ''}
        <h1 class="recipe-title">${esc(displayTitle(recipe))}</h1>
        ${!cook && (version.servings || recipe.tags?.length) ? `<div class="meta">
          ${version.servings ? `<span>${icon('shopping-basket')}${esc(version.servings)}</span>` : ''}
          ${recipe.tags?.length ? `<span class="tags">${recipe.tags.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</span>` : ''}
        </div>` : ''}
        ${!cook && recipe.description ? `<p class="desc">${esc(recipe.description)}</p>` : ''}
        ${cook && version.servings ? `<div class="meta"><span>${icon('shopping-basket')}${esc(version.servings)}</span></div>` : ''}
      </header>
      ${!ingredients.length && !steps.length ? emptyState({
        title: 'Receptet är tomt',
        text: 'Lägg till ingredienser och instruktioner.',
        button: `<a class="btn btn-primary" href="#/recept/${id}/redigera" data-link>${icon('pencil')}Redigera</a>`,
      }) : `
      <div class="seg" role="tablist" data-tab="${t.tab}">
        <span class="pill" aria-hidden="true"></span>
        <button type="button" role="tab" id="tab-ing" data-tab="ing" aria-controls="panel-ing" aria-selected="${t.tab === 'ing'}">Ingredienser</button>
        <button type="button" role="tab" id="tab-steps" data-tab="steps" aria-controls="panel-steps" aria-selected="${t.tab === 'steps'}">Instruktioner</button>
      </div>
      <div class="panel" id="panel-ing" role="tabpanel" aria-labelledby="tab-ing" data-panel="ing" ${t.tab === 'ing' ? '' : 'hidden'}>
        ${ingredients.length ? groupItems(ingredients).map(g => `
          ${g.name ? `<h2 class="group-name">${esc(g.name)}</h2>` : ''}
          <ul class="ing">${g.items.map(i => `
            <li data-id="${i.id}" class="${t.ing.has(i.id) ? 'done' : ''}" role="checkbox" aria-checked="${t.ing.has(i.id)}" tabindex="0">
              <span class="amt">${fmtAmount(i.amount)}</span><span class="unit">${esc(i.unit)}</span>
              <span class="name">${esc(i.name)}${i.note ? ` <span class="note">${esc(i.note)}</span>` : ''}</span>
            </li>`).join('')}</ul>`).join('') : '<p class="muted">Inga ingredienser.</p>'}
      </div>
      <div class="panel" id="panel-steps" role="tabpanel" aria-labelledby="tab-steps" data-panel="steps" ${t.tab === 'steps' ? '' : 'hidden'}>
        ${steps.length ? (() => {
          let n = 0;
          return groupItems(steps).map(g => `
            ${g.name ? `<h2 class="group-name">${esc(g.name)}</h2>` : ''}
            <ol class="steps">${g.items.map(s => `
              <li data-id="${s.id}" data-n="${++n}" class="${t.steps.has(s.id) ? 'done' : ''}" role="checkbox" aria-checked="${t.steps.has(s.id)}" tabindex="0">
                <span class="step-n" aria-hidden="true">${n}</span><span class="step-text">${esc(s.text)}</span></li>`).join('')}</ol>`).join('');
        })() : '<p class="muted">Inga instruktioner.</p>'}
      </div>`}
      ${cook
        ? `<button type="button" class="btn btn-quiet exit-cook" data-action="back">${icon('x')}Avsluta kokläge</button>`
        : (ingredients.length || steps.length ? `<div class="recipe-actions">
            <a class="btn btn-primary" href="#/recept/${id}/kok" data-link>${icon('chef-hat')}Kokläge</a>
            <button type="button" class="btn btn-quiet" data-action="share">${icon('share-2')}Dela</button>
          </div>` : '')}
    </article>`;

  const markCurrent = () => {
    if (!cook) return;
    const lis = $$('.steps li', root);
    lis.forEach(li => li.classList.remove('current'));
    lis.find(li => !li.classList.contains('done'))?.classList.add('current');
  };
  markCurrent();

  const toggle = li => {
    const set = li.closest('.ing') ? t.ing : t.steps;
    const on = !set.has(li.dataset.id);
    if (on) set.add(li.dataset.id); else set.delete(li.dataset.id);
    li.classList.toggle('done', on);
    li.setAttribute('aria-checked', on);
    markCurrent();
  };

  root.addEventListener('click', async e => {
    const tab = e.target.closest('[role=tab]');
    if (tab) {
      t.tab = tab.dataset.tab;
      const seg = tab.parentElement;
      seg.dataset.tab = t.tab;
      $$('[role=tab]', seg).forEach(x => x.setAttribute('aria-selected', x === tab));
      $$('[data-panel]', root).forEach(p => { p.hidden = p.dataset.panel !== t.tab; });
      return;
    }
    const li = e.target.closest('.ing li, .steps li');
    if (li) { toggle(li); return; }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const a = btn.dataset.action;
    if (a === 'back') back(cook ? `/recept/${id}` : '/');
    else if (a === 'share') shareRecipe(bundle(id));
    else if (a === 'menu') openMenu(id);
  });
  root.addEventListener('keydown', e => {
    const li = e.target.closest?.('.ing li, .steps li');
    if (li && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); toggle(li); }
  });

  if (cook) {
    const setState = on => {
      const el = $('#awake', root);
      if (!el) return;
      el.classList.toggle('off', !on);
      $('#awake-text', root).textContent = on ? 'Skärmen hålls tänd' : (wakelock.supported ? 'Skärmen kan släckas – tryck här för att försöka igen' : 'Skärmen kan inte hållas tänd i den här webbläsaren');
    };
    $('#awake', root).addEventListener('click', () => wakelock.enable(setState));
    wakelock.enable(setState).then(ok => setState(ok));
    return () => wakelock.disable();
  }
}

async function openMenu(id) {
  const r = state.recipes.get(id);
  const choice = await menuSheet({
    title: displayTitle(r),
    items: [
      { label: 'Redigera', value: 'edit', icon: 'pencil' },
      { label: 'Flytta till kapitel', value: 'move', icon: 'folder-input' },
      { label: 'Ta bort receptet', value: 'delete', icon: 'trash', danger: true },
    ],
  });
  if (choice === 'edit') navigate(`/recept/${id}/redigera`);
  else if (choice === 'move') {
    const target = await pickChapterSheet({ title: 'Flytta till kapitel', current: r.chapterId && state.chapters.has(r.chapterId) ? r.chapterId : NO_CHAPTER });
    if (!target) return;
    updateRecipe(id, { chapterId: target === NO_CHAPTER ? null : target });
    navigate(`/recept/${id}`, { replace: true });
    snack(`Flyttat till ”${target === NO_CHAPTER ? 'Utan kapitel' : state.chapters.get(target).name}”`);
  } else if (choice === 'delete') {
    if (!await confirmSheet({ title: `Ta bort ”${displayTitle(r)}”?`, ok: 'Ta bort', danger: true })) return;
    const removed = deleteRecipe(id);
    await back();
    snack('Receptet togs bort', { action: 'Ångra', duration: 8000, onAction: () => { restore(removed); navigate(`/recept/${id}`); } });
  }
}
