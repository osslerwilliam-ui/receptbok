// Historik: alla versioner, en enskild version (skrivskyddad) och jämförelse mellan två versioner.

import { icon, esc, sheet } from '../ui.js';
import { bundle, displayTitle, state, versionsOf, testlogsOf, ratingSummary, onChange } from '../store.js';
import { fmtDate, fmtAmount } from '../format.js';
import { emptyState } from '../components.js';
import { ingredientsHtml, stepsHtml, testlogsHtml, testLogSheet, avgText } from '../recipe-parts.js';
import { diffIngredients, diffSteps, diffMeta } from '../diff.js';
import { navigate, back } from '../router.js';

const appbar = title => `
  <div class="appbar">
    <button type="button" class="icon-btn" data-action="back" aria-label="Tillbaka">${icon('chevron-left')}</button>
    <span class="appbar-title">${esc(title)}</span>
  </div>`;

const missing = () => `<div class="page">${emptyState({ title: 'Receptet finns inte längre', button: `<a class="btn btn-primary" href="#/" data-link>Till startsidan</a>` })}</div>`;

export function render(root, params, ctx, { view }) {
  const draw = () => {
    if (view === 'history') drawHistory(root, params[0]);
    else if (view === 'version') drawVersion(root, params[0], params[1]);
    else drawCompare(root, params[0], params[1], params[2]);
  };
  draw();
  const off = onChange(() => { if (root.isConnected) draw(); });

  root.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    const logBtn = e.target.closest('[data-log]');
    if (logBtn) { testLogSheet(state.testlogs.get(logBtn.dataset.log).versionId, logBtn.dataset.log); return; }
    if (!btn) return;
    const a = btn.dataset.action;
    if (a === 'back') back(`/recept/${params[0]}`);
    else if (a === 'compare') compareSheet(params[0]);
    else if (a === 'compare-prev') navigate(`/recept/${params[0]}/jamfor/${btn.dataset.a}/${btn.dataset.b}`);
  });
  return off;
}

/* ---------- Versionslista ---------- */

function drawHistory(root, id) {
  const b = bundle(id);
  if (!b) { root.innerHTML = missing(); return; }
  const versions = versionsOf(b.variant.id).reverse();
  root.innerHTML = `${appbar('Historik')}
    <div class="page">
      <header class="page-head">
        <h1 class="page-title">${esc(displayTitle(b.recipe))}</h1>
        <p class="page-sub">${versions.length} ${versions.length === 1 ? 'version' : 'versioner'} · ${b.variant.status === 'locked' ? 'klart (låst)' : 'under utveckling'}</p>
      </header>
      ${versions.length > 1 ? `<button type="button" class="btn btn-quiet btn-wide compare-btn" data-action="compare">${icon('arrow-up-down')}Jämför två versioner</button>` : ''}
      <ol class="vlist">${versions.map(v => {
        const { count, avg } = ratingSummary(v.id);
        const current = v.id === b.variant.currentVersionId;
        return `<li><a class="vrow${current ? ' current' : ''}" href="#/recept/${id}/version/${v.id}" data-link>
          <span class="vnum">v${v.number}</span>
          <span class="vtxt">
            <span class="vhead"><span>${esc(fmtDate(v.createdAt))}</span>${current ? `<span class="vtag">${b.variant.status === 'locked' ? `${icon('lock')}Klar` : 'Aktuell'}</span>` : ''}</span>
            <span class="vnote">${v.changeNote ? esc(v.changeNote) : (v.number === 1 ? 'Första versionen' : '<span class="muted">Ingen beskrivning av ändringen</span>')}</span>
            <span class="vstats">${count} ${count === 1 ? 'test' : 'tester'}${avg != null ? ` · ${avgText(avg)}` : ''}</span>
          </span>
          ${icon('chevron-right', 'chev')}
        </a></li>`;
      }).join('')}</ol>
    </div>`;
}

async function compareSheet(id) {
  const b = bundle(id);
  const versions = versionsOf(b.variant.id);
  const opts = sel => versions.map(v => `<option value="${v.id}" ${v.id === sel ? 'selected' : ''}>Version ${v.number} – ${esc(fmtDate(v.createdAt))}</option>`).join('');
  const cur = versions[versions.length - 1];
  const prev = versions[versions.length - 2];
  const r = await sheet({
    title: 'Jämför versioner',
    body: `
      <label class="field"><span class="field-label">Från (äldre)</span><select id="cmp-a" class="input">${opts(prev.id)}</select></label>
      <label class="field"><span class="field-label">Till (nyare)</span><select id="cmp-b" class="input">${opts(cur.id)}</select></label>`,
    actions: [
      { label: 'Avbryt', value: null },
      { label: 'Jämför', kind: 'primary', onClick: el => [el.querySelector('#cmp-a').value, el.querySelector('#cmp-b').value] },
    ],
  });
  if (!r) return;
  let [a, bId] = r;
  if (state.versions.get(a).number > state.versions.get(bId).number) [a, bId] = [bId, a];
  navigate(`/recept/${id}/jamfor/${a}/${bId}`);
}

/* ---------- En version ---------- */

function drawVersion(root, id, vid) {
  const b = bundle(id);
  const v = state.versions.get(vid);
  if (!b || !v) { root.innerHTML = missing(); return; }
  const logs = testlogsOf(v.id);
  const prev = v.basedOnVersionId && state.versions.get(v.basedOnVersionId);
  root.innerHTML = `${appbar(`Version ${v.number}`)}
    <article class="recipe readonly">
      <header class="recipe-head">
        <span class="badge badge-quiet">${v.frozen ? icon('lock') : icon('flask-conical')}Version ${v.number} · ${esc(fmtDate(v.createdAt))}${v.frozen ? ' · skrivskyddad' : ''}</span>
        <h1 class="recipe-title">${esc(displayTitle(b.recipe))}</h1>
        ${v.servings ? `<div class="meta"><span>${icon('shopping-basket')}${esc(v.servings)}</span></div>` : ''}
        ${v.changeNote ? `<p class="changenote"><b>Ändrat:</b> ${esc(v.changeNote)}</p>` : ''}
        ${prev ? `<button type="button" class="text-btn" data-action="compare-prev" data-a="${prev.id}" data-b="${v.id}">${icon('arrow-up-down')}Jämför med v${prev.number}</button>` : ''}
      </header>
      <div class="panel">
        <h2 class="ro-heading">Ingredienser</h2>
        ${ingredientsHtml(v.ingredients)}
        <h2 class="ro-heading">Instruktioner</h2>
        ${stepsHtml(v.steps)}
      </div>
      <section class="testlogs">
        <h2 class="section-title">Tester av v${v.number}${logs.length ? ` · ${logs.length}` : ''}</h2>
        ${testlogsHtml(logs, { editable: true })}
      </section>
    </article>`;
}

/* ---------- Jämförelse ---------- */

const ingLine = i => `<span class="d-amt">${[fmtAmount(i.amount), i.unit].filter(Boolean).join(' ')}</span> <span class="d-name">${esc(i.name)}</span>${i.note ? ` <span class="note">${esc(i.note)}</span>` : ''}`;

function drawCompare(root, id, aId, bId) {
  const b = bundle(id);
  const A = state.versions.get(aId), B = state.versions.get(bId);
  if (!b || !A || !B) { root.innerHTML = missing(); return; }
  const ings = diffIngredients(A.ingredients, B.ingredients);
  const steps = diffSteps(A.steps, B.steps);
  const meta = diffMeta(A, B);
  const changedCount = [...ings, ...steps].filter(r => r.type !== 'same').length + meta.length;
  const label = { added: 'Tillagd', removed: 'Borttagen', changed: 'Ändrad' };

  root.innerHTML = `${appbar(`v${A.number} → v${B.number}`)}
    <div class="page compare">
      <header class="page-head">
        <h1 class="page-title">${esc(displayTitle(b.recipe))}</h1>
        <p class="page-sub">Version ${A.number} jämfört med version ${B.number} · ${changedCount ? `${changedCount} ${changedCount === 1 ? 'ändring' : 'ändringar'}` : 'inga skillnader'}</p>
        ${B.changeNote ? `<p class="changenote"><b>Ändrat i v${B.number}:</b> ${esc(B.changeNote)}</p>` : ''}
      </header>
      <div class="legend-row"><span class="lg added">Tillagd</span><span class="lg removed">Borttagen</span><span class="lg changed">Ändrad</span></div>
      ${meta.map(m => `<p class="d-row changed"><span class="d-tag">${m.label}</span>${esc(m.from)} → ${esc(m.to)}</p>`).join('')}
      <h2 class="ro-heading">Ingredienser</h2>
      <ul class="dlist">${ings.map(r => `
        <li class="d-row ${r.type}">${r.type !== 'same' ? `<span class="sr-only">${label[r.type]}: </span>` : ''}
          ${r.type === 'removed' ? ingLine(r.a) : ingLine(r.b)}
          ${r.type === 'changed' ? `<span class="d-change">${r.changes.map(esc).join(' · ')}</span>` : ''}
        </li>`).join('') || '<li class="muted">Inga ingredienser.</li>'}</ul>
      <h2 class="ro-heading">Instruktioner</h2>
      <ol class="dlist">${steps.map(r => `
        <li class="d-row ${r.type}">${r.type !== 'same' ? `<span class="sr-only">${label[r.type]}: </span>` : ''}
          ${r.type === 'changed' ? `<del>${esc(r.a.text)}</del><ins>${esc(r.b.text)}</ins>` : esc((r.b || r.a).text)}
        </li>`).join('') || '<li class="muted">Inga instruktioner.</li>'}</ol>
    </div>`;
}
