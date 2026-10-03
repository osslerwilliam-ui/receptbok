// Receptvy och kokläge. Visar utvecklingsläge (testloggar, ny version) eller låst/klart recept.

import { icon, esc, $, $$, menuSheet, confirmSheet, sheet, snack } from '../ui.js';
import {
  bundle, chapterOf, groupOf, displayTitle, markViewed, updateRecipe, deleteRecipe, restore, NO_CHAPTER, state, onChange,
  versionsOf, testlogsOf, newVersion, lockVariant, unlockVariant, pendingDiscard,
  selectVariant, clearVariantSelection, setFavorite, createVariant, renameVariant, setDefaultVariant, deleteVariant,
} from '../store.js';
import { fmtDate, fmtFactor, scaleServings, servingsNumber, fmtAmount, parseAmount } from '../format.js';
import { hydrate, wirePhotoClicks } from '../photos.js';
import { colorVar, pickChapterSheet, emptyState } from '../components.js';
import { ingredientsHtml, stepsHtml, testlogsHtml, testLogSheet, stars } from '../recipe-parts.js';
import { navigate, back } from '../router.js';
import { shareRecipe } from '../share.js';
import { addToListFlow } from '../tolist.js';
import * as wakelock from '../wakelock.js';

// Tillfälligt läge per recept (flik och avbockningar). Sparas inte.
const temp = new Map();
const tempFor = id => {
  if (!temp.has(id)) temp.set(id, { tab: 'ing', ing: new Set(), steps: new Set(), scale: 1 });
  return temp.get(id);
};

// Vyer som räknas som "inne i receptet": där behålls vald variant.
const INSIDE = new Set(['recipe', 'cook', 'edit', 'fix', 'history', 'version', 'compare']);

export function render(root, [id, variantParam], ctx, { cook = false } = {}) {
  // Avbockningar och skalning finns kvar bara när man växlar mellan receptet och kokläget.
  // Lämnar man receptet börjar man om nästa gång (och standardvarianten visas).
  const prev = ctx.prev;
  const samePair = prev && (prev.name === 'recipe' || prev.name === 'cook') && prev.params[0] === id;
  if (!samePair) temp.delete(id);
  if (!(prev && INSIDE.has(prev.name) && prev.params[0] === id)) clearVariantSelection(id);
  if (variantParam) selectVariant(id, variantParam);
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
          <button type="button" class="icon-btn fav-btn${recipe.favorite ? ' on' : ''}" data-action="favorite" aria-pressed="${!!recipe.favorite}" aria-label="${recipe.favorite ? 'Ta bort från favoriter' : 'Lägg till i favoriter'}">${icon('heart')}</button>
          <button type="button" class="icon-btn" data-action="share" aria-label="Dela">${icon('share-2')}</button>
          <button type="button" class="icon-btn" data-action="menu" aria-label="Meny">${icon('ellipsis-vertical')}</button>`}
      </div>
      <article class="recipe${dev ? ' is-dev' : ''}${cook ? ' cook' : ''}">
        <header class="recipe-head">
          <a class="kicker" href="#/kapitel/${ch ? ch.id : NO_CHAPTER}" data-link style="--c: ${colorVar(ch)}">
            ${ch ? `${esc(ch.emoji || '')} ${esc(ch.name)}${groupOf(recipe) ? ` · ${esc(groupOf(recipe).name)}` : ''}` : 'Utan kapitel'}</a>
          ${dev ? `<span class="badge">${icon('flask-conical')}Under utveckling · v${version.number}</span>` : ''}
          <h1 class="recipe-title">${esc(displayTitle(recipe))}</h1>
          ${b.variants.length > 1 ? `<div class="variant-chips" role="tablist" aria-label="Varianter">${b.variants.map(v => `
            <button type="button" role="tab" class="vchip${v.id === variant.id ? ' on' : ''}" data-variant="${v.id}" aria-selected="${v.id === variant.id}">
              ${esc(v.name)}${v.status === 'development' ? `<span class="vchip-dev" title="Under utveckling">${icon('flask-conical')}</span>` : ''}</button>`).join('')}
          </div>` : ''}
          ${(version.servings || hasContent || (!cook && recipe.tags?.length)) ? `<div class="meta">
            ${version.servings ? `<span>${icon('shopping-basket')}${esc(scaleServings(version.servings, t.scale))}</span>` : ''}
            ${ingredients.length ? `<button type="button" class="scale-chip${t.scale !== 1 ? ' on' : ''}" data-action="scale" aria-label="Skala receptet">${icon('arrow-up-down')}${t.scale !== 1 ? `Skalat ×${fmtFactor(t.scale)}` : 'Skala'}</button>` : ''}
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
          ${ingredientsHtml(ingredients, { done: t.ing, scale: t.scale })}
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
    hydrate(root);
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

  wirePhotoClicks(root);
  draw();
  // Rita om när datan ändras (t.ex. nytt test, låst, ångrat).
  const off = onChange(() => { if (root.isConnected) draw(); });

  root.addEventListener('click', async e => {
    const tab = e.target.closest('[role=tab][data-tab]');
    if (tab) {
      t.tab = tab.dataset.tab;
      const seg = tab.parentElement;
      seg.dataset.tab = t.tab;
      $$('[role=tab][data-tab]', seg).forEach(x => x.setAttribute('aria-selected', x === tab));
      $$('[data-panel]', root).forEach(p => { p.hidden = p.dataset.panel !== t.tab; });
      return;
    }
    const li = e.target.closest('.ing li[role], .steps li[role]');
    if (li) { toggle(li); return; }
    const vchip = e.target.closest('[data-variant]');
    if (vchip) {
      selectVariant(id, vchip.dataset.variant);
      t.ing.clear(); t.steps.clear();
      draw();
      return;
    }
    const logBtn = e.target.closest('[data-log]');
    if (logBtn) { const b = bundle(id); if (b) testLogSheet(b.version.id, logBtn.dataset.log); return; }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const a = btn.dataset.action;
    const b = bundle(id);
    if (a === 'back') back(cook ? `/recept/${id}` : '/');
    else if (a === 'share') shareRecipe(b, { scale: t.scale });
    else if (a === 'favorite') {
      const fav = !b.recipe.favorite;
      setFavorite(id, fav);
      snack(fav ? 'Tillagd i favoriter' : 'Borttagen från favoriter');
    }
    else if (a === 'scale') { const f = await scaleSheet(b.version, t.scale); if (f) { t.scale = f; draw(); } }
    else if (a === 'menu') openMenu(id, t);
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
  const choice = await menuSheet({
    title: 'Receptet är klart (låst)',
    items: [
      { label: 'Snabbrättning – stavfel och små ändringar, ingen ny version', value: 'fix', icon: 'pencil' },
      { label: `Lås upp och fortsätt utveckla v${b.version.number}`, value: 'unlock', icon: 'lock-open' },
    ],
  });
  if (choice === 'fix') navigate(`/recept/${id}/rattning`);
  else if (choice === 'unlock') {
    unlockVariant(b.variant.id);
    navigate(`/recept/${id}/redigera`);
  }
}

async function openMenu(id, t) {
  const b = bundle(id);
  const r = b.recipe;
  const dev = b.variant.status === 'development';
  const nVersions = versionsOf(b.variant.id).length;
  const variantItems = [
    { label: 'Ny variant', value: 'new-variant', icon: 'copy' },
    { label: b.variants.length > 1 ? `Variant ”${b.variant.name}”…` : 'Byt namn på variant', value: 'variant-menu', icon: 'pencil' },
  ];
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
  if (b.version.ingredients.length) items.push({ label: 'Lägg i inköpslista', value: 'to-list', icon: 'list-plus' });
  items.push(...variantItems);
  items.push(
    { label: 'Flytta till kapitel', value: 'move', icon: 'folder-input' },
    { label: 'Ta bort receptet', value: 'delete', icon: 'trash', danger: true },
  );
  const choice = await menuSheet({ title: displayTitle(r), items });
  if (choice === 'edit') editFlow(id);
  else if (choice === 'new-variant') newVariantFlow(id);
  else if (choice === 'variant-menu') variantMenu(id);
  else if (choice === 'new-version') newVersionFlow(id);
  else if (choice === 'log') testLogSheet(b.version.id);
  else if (choice === 'to-list') addToListFlow(b, { scale: t.scale });
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
    snack(`Upplåst – du utvecklar vidare på version ${v.number}`);
  } else if (choice === 'move') {
    const hasCh = r.chapterId && state.chapters.has(r.chapterId);
    const g = groupOf(r);
    const target = await pickChapterSheet({ title: 'Flytta till kapitel', withGroups: true, current: !hasCh ? NO_CHAPTER : g ? `${r.chapterId}|${g.id}` : r.chapterId });
    if (!target) return;
    const [chId, gId = null] = target === NO_CHAPTER ? [null] : target.split('|');
    updateRecipe(id, { chapterId: chId, groupId: gId });
    const ch = chId && state.chapters.get(chId);
    const grp = gId && ch.groups.find(x => x.id === gId);
    snack(`Flyttat till ”${!ch ? 'Utan kapitel' : grp ? `${ch.name} – ${grp.name}` : ch.name}”`);
  } else if (choice === 'delete') {
    if (!await confirmSheet({ title: `Ta bort ”${displayTitle(r)}”?`, text: 'Alla versioner och testloggar tas också bort.', ok: 'Ta bort', danger: true })) return;
    const removed = deleteRecipe(id);
    await back();
    snack('Receptet togs bort', { action: 'Ångra', duration: 8000, onAction: () => { restore(removed); navigate(`/recept/${id}`); } });
  }
}

/* ---------- Varianter ---------- */

async function newVariantFlow(id) {
  const b = bundle(id);
  const options = b.variants.flatMap(v => versionsOf(v.id).reverse().map(ver => ({
    id: ver.id,
    label: `${b.variants.length > 1 ? v.name + ' ' : ''}v${ver.number}${ver.id === v.currentVersionId ? ' (senaste)' : ''}`,
  })));
  const r = await sheet({
    title: 'Ny variant',
    body: `
      <p class="sheet-text">En variant är en egen version av receptet, t.ex. för en större form eller med frön. Den får egna versioner och tester.</p>
      <label class="field"><span class="field-label">Namn</span>
        <input id="var-name" class="input" type="text" maxlength="40" placeholder="t.ex. Stor form" autocomplete="off" enterkeyhint="done"></label>
      <label class="field"><span class="field-label">Utgå från</span>
        <select id="var-from" class="input">${options.map(o => `<option value="${o.id}" ${o.id === b.version.id ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>
      <p class="field-error" id="var-err" hidden>Skriv ett namn på varianten.</p>`,
    actions: [
      { label: 'Avbryt', value: null },
      {
        label: 'Skapa variant', kind: 'primary', onClick(el) {
          const name = el.querySelector('#var-name').value.trim();
          if (!name) { el.querySelector('#var-err').hidden = false; return false; }
          return { name, from: el.querySelector('#var-from').value };
        },
      },
    ],
    onOpen(el) { setTimeout(() => el.querySelector('#var-name').focus(), 60); },
  });
  if (!r) return;
  const v = createVariant(id, r.from, r.name);
  selectVariant(id, v.id);
  navigate(`/recept/${id}/redigera`);
  snack(`Varianten ”${v.name}” skapades – ändra det som skiljer`);
}

async function variantMenu(id) {
  const b = bundle(id);
  const v = b.variant;
  const isDefault = b.recipe.defaultVariantId === v.id || (!b.recipe.defaultVariantId && b.variants[0].id === v.id);
  const choice = await menuSheet({
    title: `Variant: ${v.name}`,
    items: [
      { label: 'Byt namn', value: 'rename', icon: 'pencil' },
      ...(b.variants.length > 1 && !isDefault ? [{ label: 'Visa den här först (standard)', value: 'default', icon: 'check' }] : []),
      ...(b.variants.length > 1 ? [{ label: 'Ta bort varianten', value: 'delete', icon: 'trash', danger: true }] : []),
    ],
  });
  if (choice === 'rename') {
    const name = await sheet({
      title: 'Byt namn på variant',
      body: `<label class="field"><span class="field-label">Namn</span><input id="var-rename" class="input" type="text" maxlength="40" value="${esc(v.name)}" autocomplete="off"></label>`,
      actions: [{ label: 'Avbryt', value: null }, { label: 'Spara', kind: 'primary', onClick: el => el.querySelector('#var-rename').value.trim() || false }],
      onOpen(el) { setTimeout(() => el.querySelector('#var-rename').select(), 60); },
    });
    if (name) renameVariant(v.id, name);
  } else if (choice === 'default') {
    setDefaultVariant(id, v.id);
    snack(`”${v.name}” visas nu först`);
  } else if (choice === 'delete') {
    if (!await confirmSheet({ title: `Ta bort varianten ”${v.name}”?`, text: 'Alla versioner och tester för varianten tas bort. Övriga varianter påverkas inte.', ok: 'Ta bort', danger: true })) return;
    const removed = deleteVariant(v.id);
    if (removed) snack(`Varianten ”${v.name}” togs bort`, { action: 'Ångra', duration: 8000, onAction: () => { restore(removed); selectVariant(id, v.id); } });
  }
}

/* ---------- Skala ---------- */

async function scaleSheet(version, current) {
  const base = servingsNumber(version.servings);
  const presets = [0.5, 1, 1.5, 2, 3];
  let factor = current;
  const body = () => `
    ${base ? `<div class="field"><span class="field-label">Antal (${esc(version.servings)} i receptet)</span>
      <div class="stepper">
        <button type="button" class="icon-btn" data-step="-1" aria-label="Färre">−</button>
        <span class="stepper-val" id="sc-servings">${fmtAmount(Math.round(base * factor * 2) / 2)}</span>
        <button type="button" class="icon-btn" data-step="1" aria-label="Fler">+</button>
      </div></div>` : ''}
    <div class="field"><span class="field-label">Gånger</span>
      <div class="choice choice-wrap" role="radiogroup" aria-label="Skalfaktor">
        ${presets.map(f => `<button type="button" role="radio" data-factor="${f}" aria-checked="${f === factor}">×${fmtFactor(f)}</button>`).join('')}
      </div></div>
    <label class="field"><span class="field-label">Eget tal</span>
      <input id="sc-custom" class="input" type="text" inputmode="decimal" placeholder="t.ex. 1,25" value="${presets.includes(factor) ? '' : fmtFactor(factor).replace('¼', ',25').replace('½', ',5').replace('¾', ',75')}"></label>
    <p class="sheet-text">Skalningen är tillfällig och nollställs när du lämnar receptet.</p>`;
  return sheet({
    title: 'Skala receptet',
    body: `<div id="sc-body">${body()}</div>`,
    actions: [
      { label: 'Återställ', value: 1 },
      {
        label: 'Använd', kind: 'primary', onClick: el => {
          const c = parseAmount(el.querySelector('#sc-custom').value);
          if (c && !Number.isNaN(c) && c > 0) return c;
          return factor;
        },
      },
    ],
    onOpen(el) {
      const wrap = el.querySelector('#sc-body');
      wrap.addEventListener('click', e => {
        const f = e.target.closest('[data-factor]');
        const st = e.target.closest('[data-step]');
        if (f) factor = +f.dataset.factor;
        else if (st && base) {
          const next = Math.max(0.5, Math.round(base * factor * 2) / 2 + +st.dataset.step * (base >= 2 ? 1 : 0.5));
          factor = next / base;
        } else return;
        wrap.innerHTML = body();
      });
    },
  });
}
