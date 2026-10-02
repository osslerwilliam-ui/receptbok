// Receptvy och kokläge. Visar utvecklingsläge (testloggar, ny version) eller låst/klart recept.

import { icon, esc, $, $$, menuSheet, confirmSheet, sheet, snack } from '../ui.js';
import {
  bundle, chapterOf, displayTitle, markViewed, updateRecipe, deleteRecipe, restore, NO_CHAPTER, state, onChange,
  versionsOf, testlogsOf, newVersion, lockVariant, unlockVariant, pendingDiscard,
} from '../store.js';
import { fmtDate } from '../format.js';
import { colorVar, pickChapterSheet, emptyState } from '../components.js';
import { ingredientsHtml, stepsHtml, testlogsHtml, testLogSheet, stars } from '../recipe-parts.js';
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
  // Avbockningar finns kvar bara när man växlar mellan receptet och kokläget.
  // Lämnar man receptet börjar man om nästa gång.
  const prev = ctx.prev;
  const samePair = prev && (prev.name === 'recipe' || prev.name === 'cook') && prev.params[0] === id;
  if (!samePair) temp.delete(id);
  const t = tempFor(id);
  if (!cook && state.recipes.has(id)) markViewed(id);

  const draw = () => {
    const b = bundle(id);
    if (!b) {
      root.innerHTML = `<div class="page">${emptyState({ title: 'Receptet finns inte längre', text: 'Det kan ha tagits bort.', button: `<a class="btn btn-primary" href="#/" data-link>Till startsidan</a>` })}</div>`;
      return;
    }
    const { recipe, version, variant } = b;
    const ch = chapterOf(recipe);
    const dev = variant.status === 'development';
    const { ingredients, steps } = version;
    const logs = dev ? testlogsOf(version.id) : [];
    const hasContent = ingredients.length || steps.length;

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
          <a class="kicker" href="#/kapitel/${ch ? ch.id : NO_CHAPTER}" data-link style="--c: ${colorVar(ch)}">
            ${ch ? `${esc(ch.emoji || '')} ${esc(ch.name)}` : 'Utan kapitel'}</a>
          ${dev ? `<span class="badge">${icon('flask-conical')}Under utveckling · v${version.number}</span>` : ''}
          <h1 class="recipe-title">${esc(displayTitle(recipe))}</h1>
          ${(version.servings || (!cook && recipe.tags?.length)) ? `<div class="meta">
            ${version.servings ? `<span>${icon('shopping-basket')}${esc(version.servings)}</span>` : ''}
            ${!cook && recipe.tags?.length ? `<span class="tags">${recipe.tags.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</span>` : ''}
          </div>` : ''}
          ${!cook && recipe.description ? `<p class="desc">${esc(recipe.description)}</p>` : ''}
        </header>
        ${dev && !cook && logs[0] ? `
          <button type="button" class="devnote" data-action="logs">
            <span class="h"><span>Senaste test · ${esc(fmtDate(logs[0].date))}</span>${stars(logs[0].rating)}</span>
            ${logs[0].text ? `<span class="devnote-text">${esc(logs[0].text)}</span>` : ''}
          </button>` : ''}
        ${dev && !cook && version.changeNote ? `<p class="changenote">${icon('pencil', 'inline-icon')}<span><b>Ändrat i v${version.number}:</b> ${esc(version.changeNote)}</span></p>` : ''}
        ${!hasContent ? emptyState({
          title: 'Receptet är tomt',
          text: 'Lägg till ingredienser och instruktioner.',
          button: `<button type="button" class="btn btn-primary" data-action="edit">${icon('pencil')}Redigera</button>`,
        }) : `
        <div class="seg" role="tablist" data-tab="${t.tab}">
          <span class="pill" aria-hidden="true"></span>
          <button type="button" role="tab" id="tab-ing" data-tab="ing" aria-controls="panel-ing" aria-selected="${t.tab === 'ing'}">Ingredienser</button>
          <button type="button" role="tab" id="tab-steps" data-tab="steps" aria-controls="panel-steps" aria-selected="${t.tab === 'steps'}">Instruktioner</button>
        </div>
        <div class="panel" id="panel-ing" role="tabpanel" aria-labelledby="tab-ing" data-panel="ing" ${t.tab === 'ing' ? '' : 'hidden'}>
          ${ingredientsHtml(ingredients, { done: t.ing })}
        </div>
        <div class="panel" id="panel-steps" role="tabpanel" aria-labelledby="tab-steps" data-panel="steps" ${t.tab === 'steps' ? '' : 'hidden'}>
          ${stepsHtml(steps, { done: t.steps })}
        </div>`}
        ${cook
          ? `<button type="button" class="btn btn-quiet exit-cook" data-action="back">${icon('x')}Avsluta kokläge</button>`
          : `<div class="recipe-actions">
              ${hasContent ? `<a class="btn btn-primary btn-wide" href="#/recept/${id}/kok" data-link>${icon('chef-hat')}Kokläge</a>` : ''}
              ${dev ? `
                <button type="button" class="btn btn-quiet" data-action="log">${icon('notebook-pen')}Logga test</button>
                <button type="button" class="btn btn-quiet" data-action="new-version">${icon('copy')}Ny version</button>` : ''}
            </div>
            ${dev ? `<section class="testlogs" id="testlogs">
              <h2 class="section-title">Tester av v${version.number}${logs.length ? ` · ${logs.length}` : ''}</h2>
              ${testlogsHtml(logs, { editable: true, empty: 'Inga tester än. Laga receptet och tryck på Logga test.' })}
            </section>` : ''}`}
      </article>`;
    markCurrent();
  };

  const markCurrent = () => {
    if (!cook) return;
    const lis = $$('.steps li', root);
    lis.forEach(li => li.classList.remove('current'));
    lis.find(li => !li.classList.contains('done'))?.classList.add('current');
  };

  const toggle = li => {
    const set = li.closest('.ing') ? t.ing : t.steps;
    const on = !set.has(li.dataset.id);
    if (on) set.add(li.dataset.id); else set.delete(li.dataset.id);
    li.classList.toggle('done', on);
    li.setAttribute('aria-checked', on);
    markCurrent();
  };

  draw();
  // Rita om när datan ändras (t.ex. nytt test, låst, ångrat).
  const off = onChange(() => { if (root.isConnected) draw(); });

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
    const li = e.target.closest('.ing li[role], .steps li[role]');
    if (li) { toggle(li); return; }
    const logBtn = e.target.closest('[data-log]');
    if (logBtn) { const b = bundle(id); if (b) testLogSheet(b.version.id, logBtn.dataset.log); return; }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const a = btn.dataset.action;
    const b = bundle(id);
    if (a === 'back') back(cook ? `/recept/${id}` : '/');
    else if (a === 'share') shareRecipe(b);
    else if (a === 'menu') openMenu(id);
    else if (a === 'edit') editFlow(id);
    else if (a === 'log') testLogSheet(b.version.id);
    else if (a === 'new-version') newVersionFlow(id);
    else if (a === 'logs') $('#testlogs', root)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  root.addEventListener('keydown', e => {
    const li = e.target.closest?.('.ing li[role], .steps li[role]');
    if (li && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); toggle(li); }
  });

  if (cook) {
    const setState = on => {
      const el = $('#awake', root);
      if (!el) return;
      el.classList.toggle('off', !on);
      $('#awake-text', root).textContent = on ? 'Skärmen hålls tänd' : (wakelock.supported ? 'Skärmen kan släckas – tryck här för att försöka igen' : 'Skärmen kan inte hållas tänd i den här webbläsaren');
    };
    root.addEventListener('click', e => { if (e.target.closest('#awake')) wakelock.enable(setState); });
    wakelock.enable(setState).then(ok => setState(ok));
    return () => { off(); wakelock.disable(); };
  }
  return off;
}

/* ---------- Flöden ---------- */

async function newVersionFlow(id) {
  const b = bundle(id);
  const ver = newVersion(b.variant.id);
  pendingDiscard.add(ver.id);
  navigate(`/recept/${id}/redigera`);
}

/** Redigera: direkt om receptet är under utveckling, annars välj snabbrättning eller upplåsning. */
export async function editFlow(id) {
  const b = bundle(id);
  if (!b) return;
  if (b.variant.status === 'development') { navigate(`/recept/${id}/redigera`); return; }
  const next = versionsOf(b.variant.id).length + 1;
  const choice = await menuSheet({
    title: 'Receptet är klart (låst)',
    items: [
      { label: 'Snabbrättning – stavfel och små ändringar, ingen ny version', value: 'fix', icon: 'pencil' },
      { label: `Lås upp och skapa version ${next}`, value: 'unlock', icon: 'lock-open' },
    ],
  });
  if (choice === 'fix') navigate(`/recept/${id}/rattning`);
  else if (choice === 'unlock') {
    const ver = unlockVariant(b.variant.id);
    pendingDiscard.add(ver.id);
    navigate(`/recept/${id}/redigera`);
  }
}

async function openMenu(id) {
  const b = bundle(id);
  const r = b.recipe;
  const dev = b.variant.status === 'development';
  const nVersions = versionsOf(b.variant.id).length;
  const items = dev ? [
    { label: 'Redigera', value: 'edit', icon: 'pencil' },
    { label: 'Ny version', value: 'new-version', icon: 'copy' },
    { label: 'Logga test', value: 'log', icon: 'notebook-pen' },
    { label: 'Lås – markera som klart', value: 'lock', icon: 'lock' },
  ] : [
    { label: 'Redigera', value: 'edit', icon: 'pencil' },
    { label: 'Lås upp', value: 'unlock', icon: 'lock-open' },
  ];
  if (nVersions > 1) items.push({ label: `Visa historik (${nVersions} versioner)`, value: 'history', icon: 'clock' });
  items.push(
    { label: 'Flytta till kapitel', value: 'move', icon: 'folder-input' },
    { label: 'Ta bort receptet', value: 'delete', icon: 'trash', danger: true },
  );
  const choice = await menuSheet({ title: displayTitle(r), items });
  if (choice === 'edit') editFlow(id);
  else if (choice === 'new-version') newVersionFlow(id);
  else if (choice === 'log') testLogSheet(b.version.id);
  else if (choice === 'history') navigate(`/recept/${id}/historik`);
  else if (choice === 'lock') {
    if (!await confirmSheet({
      title: 'Lås receptet som klart?',
      text: `Version ${b.version.number} blir den färdiga versionen. Testloggar och utvecklingsverktyg döljs. Du kan alltid låsa upp igen.`,
      ok: 'Lås',
    })) return;
    lockVariant(b.variant.id);
    snack(`Låst – version ${b.version.number} är klar`);
  } else if (choice === 'unlock') {
    const v = unlockVariant(b.variant.id);
    snack(`Upplåst – version ${v.number} skapades för vidareutveckling`);
  } else if (choice === 'move') {
    const target = await pickChapterSheet({ title: 'Flytta till kapitel', current: r.chapterId && state.chapters.has(r.chapterId) ? r.chapterId : NO_CHAPTER });
    if (!target) return;
    updateRecipe(id, { chapterId: target === NO_CHAPTER ? null : target });
    snack(`Flyttat till ”${target === NO_CHAPTER ? 'Utan kapitel' : state.chapters.get(target).name}”`);
  } else if (choice === 'delete') {
    if (!await confirmSheet({ title: `Ta bort ”${displayTitle(r)}”?`, text: 'Alla versioner och testloggar tas också bort.', ok: 'Ta bort', danger: true })) return;
    const removed = deleteRecipe(id);
    await back();
    snack('Receptet togs bort', { action: 'Ångra', duration: 8000, onAction: () => { restore(removed); navigate(`/recept/${id}`); } });
  }
}
