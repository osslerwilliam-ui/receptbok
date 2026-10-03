// Redigera recept: uppgifter, ingredienser och steg. Sparar automatiskt.

import { icon, esc, $, $$, sheet, menuSheet, snack, debounce, autoGrow } from '../ui.js';
import { state, bundle, chaptersSorted, groupsOf, groupOf, saveRecipeAndVersion, deleteRecipe, uuid, justCreated, pendingDiscard, isUnchangedCopy, discardVersion, lockVariant, testlogsOf } from '../store.js';
import { testlogsHtml } from '../recipe-parts.js';
import { fmtAmount, parseAmount, parseIngredientLine, parseStepLines, UNITS } from '../format.js';
import { emptyState } from '../components.js';
import { navigate, back } from '../router.js';
import { enableDragSort } from '../dragsort.js';

/** Platt lista med grupprubriker → redigeringsrader. */
function toItems(list, kind, map) {
  const out = [];
  let cur = '';
  for (const it of list) {
    const g = (it.group || '').trim();
    if (g !== cur) { out.push({ kind: 'group', id: uuid(), name: g }); cur = g; }
    out.push({ kind, ...map(it) });
  }
  return out;
}

function fromItems(items, kind, map) {
  const out = [];
  let group = '';
  for (const it of items) {
    if (it.kind === 'group') { group = it.name.trim(); continue; }
    const obj = map(it);
    if (!obj) continue;
    if (group) obj.group = group;
    out.push(obj);
  }
  return out;
}

export function render(root, [id], _ctx, { fix = false } = {}) {
  let editTab = 'ing';
  const b = bundle(id);
  if (!b) {
    root.innerHTML = `<div class="page">${emptyState({ title: 'Receptet finns inte längre', button: `<a class="btn btn-primary" href="#/" data-link>Till startsidan</a>` })}</div>`;
    return;
  }
  const { recipe, version } = b;
  if (version.frozen && !fix) {
    root.innerHTML = `<div class="page">${emptyState({ title: 'Den här versionen är låst', text: 'Lås upp receptet eller gör en snabbrättning för att ändra det.', button: `<a class="btn btn-primary" href="#/recept/${id}" data-link>Till receptet</a>` })}</div>`;
    return;
  }
  // Ny version: visa föregående versions tester och fråga vad som ändrats.
  const prevVersion = !fix && version.basedOnVersionId ? state.versions.get(version.basedOnVersionId) : null;
  const prevLogs = prevVersion ? testlogsOf(prevVersion.id) : [];

  const plain = document.documentElement.dataset.palette === 'serios'; // Seriös: inga ikoner
  const form = {
    title: recipe.title || '',
    chapterId: recipe.chapterId && state.chapters.has(recipe.chapterId) ? recipe.chapterId : '',
    groupId: groupOf(recipe)?.id || '',
    servings: version.servings || '',
    description: recipe.description || '',
    tags: (recipe.tags || []).join(', '),
    changeNote: version.changeNote || '',
  };
  let ings = toItems(version.ingredients, 'ing', i => ({ id: i.id, amount: i.amount, amountText: fmtAmount(i.amount), unit: i.unit || '', name: i.name || '', note: i.note || '' }));
  let steps = toItems(version.steps, 'step', s => ({ id: s.id, text: s.text || '' }));

  root.innerHTML = `
    <div class="appbar appbar-edit">
      <button type="button" class="icon-btn" data-action="back" aria-label="Tillbaka">${icon('chevron-left')}</button>
      <span class="saved" id="saved" aria-live="polite"></span>
      <span class="spacer"></span>
      <button type="button" class="btn btn-primary btn-small" data-action="done">${icon('check')}Klar</button>
    </div>
    <div class="page edit">
      ${fix ? `<p class="edit-banner">${icon('pencil')}<span><b>Snabbrättning av v${version.number}.</b> För stavfel och små ändringar – ingen ny version skapas.</span></p>` : ''}
      ${prevVersion ? `
        <details class="prev-logs" ${prevLogs.length ? 'open' : ''}>
          <summary>${icon('notebook-pen')}Tester av v${prevVersion.number} (${prevLogs.length})</summary>
          ${testlogsHtml(prevLogs, { empty: `Inga tester loggades för v${prevVersion.number}.` })}
        </details>
        <label class="field changenote-field"><span class="field-label">Vad ändrade du jämfört med v${prevVersion.number}?</span>
          <textarea id="f-change" class="input" rows="2" placeholder="t.ex. Mer vatten, 10 min längre i ugnen" data-f="changeNote">${esc(form.changeNote)}</textarea></label>` : ''}
      ${b.variants.length > 1 ? `<p class="edit-variant">${icon('copy', 'inline-icon')}Variant: <b>${esc(b.variant.name)}</b> · v${version.number}</p>` : ''}
      <label class="sr-only" for="f-title">Titel</label>
      <textarea id="f-title" class="title-input" rows="1" placeholder="Receptets namn" data-f="title" enterkeyhint="next">${esc(form.title)}</textarea>

      <div class="field-row">
        <label class="field"><span class="field-label">Kapitel</span>
          <select id="f-chapter" class="input" data-f="chapterId">
            ${chaptersSorted().map(c => `<option value="${c.id}" ${c.id === form.chapterId ? 'selected' : ''}>${esc((c.emoji && !plain ? c.emoji + ' ' : '') + c.name)}</option>`).join('')}
            <option value="" ${!form.chapterId ? 'selected' : ''}>Utan kapitel</option>
          </select></label>
        <label class="field"><span class="field-label">Ger</span>
          <input id="f-servings" class="input" type="text" placeholder="t.ex. 4 portioner" value="${esc(form.servings)}" data-f="servings" autocomplete="off"></label>
      </div>
      <div id="group-field"></div>
      <label class="field"><span class="field-label">Beskrivning <span class="opt">(valfritt)</span></span>
        <textarea id="f-desc" class="input" rows="2" placeholder="Några ord om receptet" data-f="description">${esc(form.description)}</textarea></label>
      <label class="field"><span class="field-label">Taggar <span class="opt">(valfritt, skilj med komma)</span></span>
        <input id="f-tags" class="input" type="text" placeholder="t.ex. vegetariskt, snabbt" value="${esc(form.tags)}" data-f="tags" autocomplete="off"></label>

      <div class="seg ed-tabs" role="tablist" data-tab="${editTab}">
        <span class="pill" aria-hidden="true"></span>
        <button type="button" role="tab" id="etab-ing" data-etab="ing" aria-controls="epanel-ing" aria-selected="${editTab === 'ing'}">Ingredienser</button>
        <button type="button" role="tab" id="etab-steps" data-etab="steps" aria-controls="epanel-steps" aria-selected="${editTab === 'steps'}">Instruktioner</button>
      </div>

      <section class="ed-section" id="epanel-ing" role="tabpanel" aria-labelledby="etab-ing" data-epanel="ing" ${editTab === 'ing' ? '' : 'hidden'}>
        <div class="ed-list" id="ing-list"></div>
        <div class="ed-add">
          <button type="button" class="btn btn-quiet btn-small" data-action="add-ing">${icon('plus')}Ingrediens</button>
          <button type="button" class="btn btn-quiet btn-small" data-action="add-ing-group">${icon('plus')}Grupp</button>
          <button type="button" class="btn btn-quiet btn-small" data-action="paste-ing">${icon('clipboard-paste')}Klistra in</button>
        </div>
        <p class="ed-hint">Håll fingret på ${icon('ellipsis-vertical', 'inline-icon')} och dra för att flytta en rad.</p>
      </section>

      <section class="ed-section" id="epanel-steps" role="tabpanel" aria-labelledby="etab-steps" data-epanel="steps" ${editTab === 'steps' ? '' : 'hidden'}>
        <div class="ed-list" id="step-list"></div>
        <div class="ed-add">
          <button type="button" class="btn btn-quiet btn-small" data-action="add-step">${icon('plus')}Steg</button>
          <button type="button" class="btn btn-quiet btn-small" data-action="add-step-group">${icon('plus')}Grupp</button>
          <button type="button" class="btn btn-quiet btn-small" data-action="paste-step">${icon('clipboard-paste')}Klistra in</button>
        </div>
        <p class="ed-hint">Håll fingret på ${icon('ellipsis-vertical', 'inline-icon')} och dra för att flytta ett steg.</p>
      </section>
      <datalist id="units">${UNITS.map(u => `<option value="${u}">`).join('')}</datalist>
    </div>`;

  // Grupp: visas bara om kapitlet har grupper.
  const drawGroupField = () => {
    const groups = form.chapterId ? groupsOf(form.chapterId) : [];
    if (!groups.some(g => g.id === form.groupId)) form.groupId = '';
    $('#group-field', root).innerHTML = groups.length ? `
      <label class="field"><span class="field-label">Grupp i kapitlet</span>
        <select id="f-group" class="input" data-f="groupId">
          <option value="" ${!form.groupId ? 'selected' : ''}>Ingen grupp</option>
          ${groups.map(g => `<option value="${g.id}" ${g.id === form.groupId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}
        </select></label>` : '';
  };
  drawGroupField();

  const ingList = $('#ing-list', root);
  const stepList = $('#step-list', root);
  const savedEl = $('#saved', root);

  /* ---------- Spara ---------- */
  let dirty = false;
  const doSave = () => {
    if (!dirty) return;
    dirty = false;
    const tags = form.tags.split(',').map(s => s.trim()).filter(Boolean);
    const ingredients = fromItems(ings, 'ing', i => (i.name.trim() || i.amount != null ? { id: i.id, amount: i.amount, unit: i.unit.trim(), name: i.name.trim(), ...(i.note.trim() ? { note: i.note.trim() } : {}) } : null));
    const stepsOut = fromItems(steps, 'step', s => (s.text.trim() ? { id: s.id, text: s.text.trim() } : null));
    const p = saveRecipeAndVersion(id,
      { title: form.title.trim(), chapterId: form.chapterId || null, groupId: form.groupId || null, description: form.description.trim(), tags },
      version.id,
      { servings: form.servings.trim(), ingredients, steps: stepsOut, ...(prevVersion ? { changeNote: form.changeNote.trim() } : {}) });
    Promise.resolve(p).then(() => { if (!dirty) savedEl.innerHTML = `${icon('check')}Sparat`; });
  };
  const save = debounce(doSave, 500);
  const changed = () => {
    dirty = true;
    savedEl.textContent = 'Sparar…';
    save();
  };

  /* ---------- Rader ---------- */
  const rowMenuBtn = (list, i) => `<button type="button" class="icon-btn ed-menu" data-op="menu" data-list="${list}" data-i="${i}" aria-label="Flytta eller ta bort (håll och dra för att flytta)">${icon('ellipsis-vertical')}</button>`;

  const groupRow = (it, i, list) => `
    <div class="ed-row ed-group" data-i="${i}">
      <input class="input ed-group-name" type="text" value="${esc(it.name)}" placeholder="Gruppnamn, t.ex. Deg" data-k="name" aria-label="Gruppnamn">
      ${rowMenuBtn(list, i)}
    </div>`;

  function drawIngs() {
    ingList.innerHTML = ings.length ? ings.map((it, i) => it.kind === 'group' ? groupRow(it, i, 'ing') : `
      <div class="ed-row ed-ing" data-i="${i}">
        <input class="input amt" type="text" inputmode="decimal" value="${esc(it.amountText)}" placeholder="Mängd" data-k="amountText" aria-label="Mängd" autocomplete="off">
        <input class="input unit" type="text" value="${esc(it.unit)}" placeholder="Enhet" data-k="unit" aria-label="Enhet" list="units" autocomplete="off" autocapitalize="off">
        <input class="input name" type="text" value="${esc(it.name)}" placeholder="Ingrediens" data-k="name" aria-label="Ingrediens" autocomplete="off" enterkeyhint="next">
        ${rowMenuBtn('ing', i)}
        <input class="input note" type="text" value="${esc(it.note)}" placeholder="Anteckning, t.ex. rumsvarmt" data-k="note" aria-label="Anteckning" autocomplete="off" enterkeyhint="next">
        <p class="field-error amt-err" ${Number.isNaN(parseAmount(it.amountText)) ? '' : 'hidden'}>Skriv mängden som en siffra, t.ex. 1,5 eller ½.</p>
      </div>`).join('') : '<p class="ed-empty">Inga ingredienser än.</p>';
  }

  function drawSteps() {
    let n = 0;
    stepList.innerHTML = steps.length ? steps.map((it, i) => it.kind === 'group' ? groupRow(it, i, 'step') : `
      <div class="ed-row ed-step" data-i="${i}">
        <span class="step-n" aria-hidden="true">${++n}</span>
        <textarea class="input" rows="2" placeholder="Beskriv steget" data-k="text" aria-label="Steg ${n}">${esc(it.text)}</textarea>
        ${rowMenuBtn('step', i)}
      </div>`).join('') : '<p class="ed-empty">Inga steg än.</p>';
    $$('textarea', stepList).forEach(autoGrow);
  }

  drawIngs();
  drawSteps();
  const move = (items, draw) => (from, to) => {
    const [it] = items.splice(from, 1);
    items.splice(to, 0, it);
    draw();
    changed();
  };
  enableDragSort(ingList, { rowSel: '.ed-row', handleSel: '.ed-menu', onMove: (f, t) => move(ings, drawIngs)(f, t) });
  enableDragSort(stepList, { rowSel: '.ed-row', handleSel: '.ed-menu', onMove: (f, t) => move(steps, drawSteps)(f, t) });
  // Mät textfältens höjd först när vyn finns på sidan.
  requestAnimationFrame(() => $$('textarea', root).forEach(autoGrow));
  document.fonts?.ready.then(() => $$('textarea', root).forEach(autoGrow));

  const focusRow = (listEl, i, sel) => requestAnimationFrame(() => $(`.ed-row[data-i="${i}"] ${sel}`, listEl)?.focus());
  const newIng = () => ({ kind: 'ing', id: uuid(), amount: null, amountText: '', unit: '', name: '', note: '' });

  /* ---------- Händelser ---------- */
  root.addEventListener('input', e => {
    const el = e.target;
    if (el.tagName === 'TEXTAREA') autoGrow(el);
    if (el.dataset.f) { form[el.dataset.f] = el.value; changed(); return; }
    const row = el.closest('.ed-row');
    if (!row || !el.dataset.k) return;
    const items = row.parentElement === ingList ? ings : steps;
    const it = items[+row.dataset.i];
    it[el.dataset.k] = el.value;
    if (el.dataset.k === 'amountText') {
      const a = parseAmount(el.value);
      const bad = Number.isNaN(a);
      el.classList.toggle('invalid', bad);
      el.setAttribute('aria-invalid', bad);
      $('.amt-err', row).hidden = !bad;
      if (!bad) it.amount = a;
    }
    changed();
  });
  root.addEventListener('change', e => {
    if (e.target.dataset.f) { form[e.target.dataset.f] = e.target.value; changed(); }
    if (e.target.dataset.f === 'chapterId') drawGroupField();
  });

  // Enter i en ingrediensrad: ny rad under.
  ingList.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    const row = e.target.closest('.ed-ing');
    if (!row) return;
    e.preventDefault();
    const i = +row.dataset.i;
    ings.splice(i + 1, 0, newIng());
    drawIngs();
    focusRow(ingList, i + 1, '.amt');
    changed();
  });
  $('#f-title', root).addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); $('#f-servings', root).focus(); }
  });

  root.addEventListener('click', async e => {
    const tabBtn = e.target.closest('[data-etab]');
    if (tabBtn) {
      editTab = tabBtn.dataset.etab;
      const seg = tabBtn.parentElement;
      seg.dataset.tab = editTab;
      $$('[data-etab]', seg).forEach(b => b.setAttribute('aria-selected', b === tabBtn));
      $$('[data-epanel]', root).forEach(p => { p.hidden = p.dataset.epanel !== editTab; });
      if (editTab === 'steps') $$('textarea', stepList).forEach(autoGrow);
      return;
    }
    const btn = e.target.closest('[data-action], [data-op]');
    if (!btn) return;
    const a = btn.dataset.action;
    if (a === 'back') { back(`/recept/${id}`); return; }
    if (a === 'done') {
      save.flush();
      if (!isEmpty() && justCreated.has(id)) {
        justCreated.delete(id);
        const choice = await sheet({
          title: 'Är receptet färdigt?',
          body: '<p class="sheet-text">Lås det som klart om det redan fungerar. Annars fortsätter du utveckla det med testloggar och nya versioner.</p>',
          actions: [
            { label: 'Fortsätt utveckla', value: 'dev', icon: 'flask-conical' },
            { label: 'Lås som klart', value: 'lock', kind: 'primary', icon: 'lock' },
          ],
        });
        if (choice === 'lock') lockVariant(bundle(id).variant.id);
      }
      if (isEmpty()) back();
      else if (history.state?.from === `/recept/${id}`) back();
      else navigate(`/recept/${id}`, { replace: true });
      return;
    }
    if (a === 'add-ing') { ings.push(newIng()); drawIngs(); focusRow(ingList, ings.length - 1, '.amt'); changed(); }
    else if (a === 'add-ing-group') { ings.push({ kind: 'group', id: uuid(), name: '' }); drawIngs(); focusRow(ingList, ings.length - 1, 'input'); changed(); }
    else if (a === 'add-step') { steps.push({ kind: 'step', id: uuid(), text: '' }); drawSteps(); focusRow(stepList, steps.length - 1, 'textarea'); changed(); }
    else if (a === 'add-step-group') { steps.push({ kind: 'group', id: uuid(), name: '' }); drawSteps(); focusRow(stepList, steps.length - 1, 'input'); changed(); }
    else if (a === 'paste-ing') {
      const text = await pasteSheet('Klistra in ingredienser', 'En ingrediens per rad, t.ex.\nDeg:\n500 g vetemjöl\n3 dl vatten\n1 tsk salt');
      if (!text) return;
      const parsed = text.split(/\r?\n/).map(parseIngredientLine).filter(Boolean);
      for (const p of parsed) {
        if (p.group != null) ings.push({ kind: 'group', id: uuid(), name: p.group });
        else ings.push({ kind: 'ing', id: uuid(), amount: p.amount, amountText: fmtAmount(p.amount), unit: p.unit, name: p.name, note: p.note });
      }
      drawIngs(); changed();
      snack(`${parsed.filter(p => p.group == null).length} ingredienser tillagda – kontrollera att de blev rätt`);
    } else if (a === 'paste-step') {
      const text = await pasteSheet('Klistra in instruktioner', 'Ett steg per rad. Numrering tas bort automatiskt.');
      if (!text) return;
      const parsed = parseStepLines(text);
      for (const p of parsed) steps.push(p.group != null ? { kind: 'group', id: uuid(), name: p.group } : { kind: 'step', id: uuid(), text: p.text });
      drawSteps(); changed();
      snack(`${parsed.filter(p => p.group == null).length} steg tillagda`);
    } else if (btn.dataset.op === 'menu') {
      const isIng = btn.dataset.list === 'ing';
      const items = isIng ? ings : steps;
      const draw = isIng ? drawIngs : drawSteps;
      const i = +btn.dataset.i;
      const it = items[i];
      const label = it.kind === 'group' ? (it.name || 'Grupp') : isIng ? (it.name || 'Ingrediens') : `Steg`;
      const choice = await menuSheet({
        title: label,
        items: [
          ...(i > 0 ? [{ label: 'Flytta upp', value: 'up', icon: 'arrow-up' }] : []),
          ...(i < items.length - 1 ? [{ label: 'Flytta ned', value: 'down', icon: 'arrow-down' }] : []),
          ...(isIng && it.kind === 'ing' ? [{ label: 'Lägg till rad under', value: 'below', icon: 'plus' }] : []),
          { label: 'Ta bort', value: 'del', icon: 'trash', danger: true },
        ],
      });
      if (!choice) return;
      if (choice === 'up' || choice === 'down') {
        const j = choice === 'up' ? i - 1 : i + 1;
        [items[i], items[j]] = [items[j], items[i]];
      } else if (choice === 'below') {
        items.splice(i + 1, 0, newIng());
      } else if (choice === 'del') {
        const [removed] = items.splice(i, 1);
        snack(`${label} togs bort`, { action: 'Ångra', onAction: () => { items.splice(i, 0, removed); draw(); changed(); } });
      }
      draw();
      if (choice === 'below') focusRow(ingList, i + 1, '.amt');
      changed();
    }
  });

  const onHide = () => { if (document.visibilityState === 'hidden') save.flush(); };
  document.addEventListener('visibilitychange', onHide);

  function isEmpty() {
    const cur = bundle(id);
    return cur && !cur.recipe.title && !cur.recipe.description && !cur.version.ingredients.length && !cur.version.steps.length && !cur.version.servings;
  }

  // När man lämnar vyn: spara direkt. Ett helt tomt nytt recept sparas inte.
  return () => {
    document.removeEventListener('visibilitychange', onHide);
    save.flush();
    if (pendingDiscard.has(version.id)) {
      pendingDiscard.delete(version.id);
      if (isUnchangedCopy(version.id)) {
        discardVersion(version.id);
        snack(`Inget ändrades – version ${version.number} sparades inte`);
        return;
      }
    }
    if (isEmpty()) {
      deleteRecipe(id);
      snack('Det tomma receptet sparades inte');
    }
  };
}

function pasteSheet(title, hint) {
  return sheet({
    title,
    body: `<p class="sheet-text">${esc(hint).replace(/\n/g, '<br>')}</p>
      <textarea id="paste-text" class="input paste-area" rows="8" aria-label="Text att tolka"></textarea>`,
    actions: [
      { label: 'Avbryt', value: null },
      { label: 'Lägg till', kind: 'primary', onClick: el => el.querySelector('#paste-text').value.trim() || null },
    ],
    onOpen(el) { setTimeout(() => el.querySelector('#paste-text').focus(), 50); },
  });
}
