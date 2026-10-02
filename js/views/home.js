// Startsida: sök, kapitel, senast visade och under utveckling.

import { icon, esc, $, sheet } from '../ui.js';
import { state, meta, testlogsOf, variantsOf, displayTitle, chaptersSorted, createChapter, createRecipe, reorderChapters, isInDevelopment, chapterOf, NO_CHAPTER } from '../store.js';
import { search } from '../search.js';
import { fmtRelative, fmtDate } from '../format.js';
import { recipeRow, chapterCard, noChapterCard, chapterSheet, pickChapterSheet, emptyState, colorVar } from '../components.js';
import { navigate } from '../router.js';

let query = '';

export function render(root, _params, ctx) {
  root.innerHTML = `
    <div class="page home">
      <header class="home-head">
        <h1 class="wordmark">Recept<em>bok</em></h1>
        <a class="icon-btn" href="#/installningar" data-link aria-label="Inställningar">${icon('settings')}</a>
      </header>
      <div class="search" role="search">
        ${icon('search', 'search-icon')}
        <input id="q" type="search" placeholder="Sök recept, ingrediens, kapitel…" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-label="Sök recept" value="${esc(query)}">
        <button type="button" class="search-clear icon-btn" aria-label="Rensa sökningen" hidden>${icon('x')}</button>
      </div>
      <div id="browse"></div>
      <div id="results"></div>
    </div>`;

  const input = $('#q', root);
  const clear = $('.search-clear', root);
  const browse = $('#browse', root);
  const results = $('#results', root);

  const update = () => {
    const q = query.trim();
    clear.hidden = !query;
    browse.hidden = !!q;
    results.hidden = !q;
    if (q) renderResults(results, q);
  };
  input.addEventListener('input', () => { query = input.value; update(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
  clear.addEventListener('click', () => { query = ''; input.value = ''; update(); input.focus(); });

  renderBrowse(browse);
  update();

  root.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const a = btn.dataset.action;
    if (a === 'new-chapter') {
      const v = await chapterSheet();
      if (v) { createChapter(v); renderBrowse(browse); }
    } else if (a === 'sort-chapters') {
      if (await sortSheet()) renderBrowse(browse);
    } else if (a === 'create-from-search') {
      const title = query.trim();
      let chapterId = null;
      if (state.chapters.size) {
        const id = await pickChapterSheet({ title: 'Vilket kapitel?' });
        if (!id) return;
        chapterId = id === NO_CHAPTER ? null : id;
      }
      const r = createRecipe({ title, chapterId });
      query = '';
      navigate(`/recept/${r.id}/redigera`);
    }
  });

  if (ctx.direction === 'init' && !query) {
    // Sökfältet i fokus vid start
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
  }
}

function renderBrowse(el) {
  const chapters = chaptersSorted();
  const recipes = [...state.recipes.values()];
  let html = '';

  if (backupDue(recipes)) {
    html += `<a class="notice" href="#/installningar" data-link>${icon('hard-drive-download')}<span>${meta.lastExportAt ? 'Det är över 30 dagar sedan din senaste backup.' : 'Du har inte gjort någon backup än.'} <u>Gör en backup</u></span></a>`;
  }

  if (!chapters.length && !recipes.length) {
    html += emptyState({
      title: 'Välkommen till din receptbok',
      text: 'Börja med att skapa ett kapitel, till exempel Bröd eller Vardagsmat. Sedan lägger du till recept i det.',
      button: `<button type="button" class="btn btn-primary" data-action="new-chapter">${icon('folder-plus')}Skapa första kapitlet</button>`,
      icon: 'book-open',
    });
    el.innerHTML = html;
    return;
  }

  html += `<div class="section-head"><h2 class="section-title">Kapitel</h2>
    ${chapters.length > 1 ? `<button type="button" class="text-btn" data-action="sort-chapters">${icon('arrow-up-down')}Sortera</button>` : ''}</div>
    <div class="chapters">
      ${chapters.map(chapterCard).join('')}
      ${noChapterCard()}
      <button type="button" class="chapter add" data-action="new-chapter">${icon('folder-plus')}<span>Nytt kapitel</span></button>
    </div>`;

  const recent = recipes.filter(r => r.lastViewedAt).sort((a, b) => b.lastViewedAt.localeCompare(a.lastViewedAt)).slice(0, 5);
  if (recent.length) {
    html += `<h2 class="section-title">Senast visade</h2><div class="rlist">${recent.map(r =>
      recipeRow(r, { sub: `${esc(chapterOf(r)?.name || 'Utan kapitel')} · ${fmtRelative(r.lastViewedAt)}` })).join('')}</div>`;
  }

  const dev = recipes.filter(r => isInDevelopment(r.id));
  if (dev.length) {
    // En rad per variant som är under utveckling.
    html += `<h2 class="section-title">Under utveckling</h2><div class="rlist">${dev.flatMap(r => {
      const vs = variantsOf(r.id);
      return vs.filter(v => v.status === 'development').map(v => {
        const ver = state.versions.get(v.currentVersionId);
        const last = ver && testlogsOf(ver.id)[0];
        const sub = [esc(chapterOf(r)?.name || 'Utan kapitel'), ver ? `v${ver.number}` : '', last ? `testad ${fmtDate(last.date)}` : 'inte testad än'].filter(Boolean).join(' · ');
        const title = vs.length > 1 ? `${esc(displayTitle(r))} <span class="title-variant">– ${esc(v.name)}</span>` : undefined;
        return recipeRow(r, { sub, titleHtml: title, path: vs.length > 1 ? `/recept/${r.id}/v/${v.id}` : null });
      });
    }).join('')}</div>`;
  }
  el.innerHTML = html;
}

function backupDue(recipes) {
  if (!recipes.length) return false;
  const DAY = 864e5;
  if (meta.lastExportAt) return Date.now() - new Date(meta.lastExportAt).getTime() > 30 * DAY;
  // Aldrig exporterat: påminn när det äldsta receptet är en vecka gammalt.
  const oldest = recipes.reduce((m, r) => (r.createdAt < m ? r.createdAt : m), recipes[0].createdAt);
  return Date.now() - new Date(oldest).getTime() > 7 * DAY;
}

function highlight(title, ranges) {
  let out = '';
  let pos = 0;
  for (const [s, e] of ranges) {
    if (s < pos) continue;
    out += esc(title.slice(pos, s)) + '<mark>' + esc(title.slice(s, e)) + '</mark>';
    pos = e;
  }
  return out + esc(title.slice(pos));
}

function renderResults(el, q) {
  const hits = search(q);
  if (!hits.length) {
    el.innerHTML = emptyState({
      title: 'Inget recept hittades',
      text: 'Prova ett kortare ord, eller sök på en ingrediens du vet finns i receptet.',
      button: `<button type="button" class="btn btn-primary" data-action="create-from-search">${icon('plus')}Skapa receptet ”${esc(q)}”</button>`,
      icon: 'search-x',
    });
    return;
  }
  el.innerHTML = `<h2 class="section-title">${hits.length}${hits.length >= 60 ? '+' : ''} ${hits.length === 1 ? 'träff' : 'träffar'}</h2>
    <div class="rlist">${hits.map(h => {
      const r = state.recipes.get(h.id);
      const sub = h.reason ? `${h.reason.kind}: <b>${esc(h.reason.text)}</b>` : esc(h.chapter?.name || 'Utan kapitel');
      return recipeRow(r, { sub, titleHtml: highlight(h.title, h.ranges) });
    }).join('')}</div>`;
}

async function sortSheet() {
  let order = chaptersSorted().map(c => c.id);
  const list = () => order.map((id, i) => {
    const c = state.chapters.get(id);
    return `<li class="sort-row" style="--c: ${colorVar(c)}">
      <span class="menu-emoji">${esc(c.emoji || '•')}</span><span class="sort-name">${esc(c.name)}</span>
      <button type="button" class="icon-btn" data-move="${i}" data-dir="-1" aria-label="Flytta upp ${esc(c.name)}" ${i === 0 ? 'disabled' : ''}>${icon('arrow-up')}</button>
      <button type="button" class="icon-btn" data-move="${i}" data-dir="1" aria-label="Flytta ned ${esc(c.name)}" ${i === order.length - 1 ? 'disabled' : ''}>${icon('arrow-down')}</button>
    </li>`;
  }).join('');
  const v = await sheet({
    title: 'Sortera kapitel',
    body: `<ul class="sort-list">${list()}</ul>`,
    actions: [{ label: 'Avbryt', value: false }, { label: 'Klar', value: true, kind: 'primary' }],
    onOpen(el) {
      const ul = el.querySelector('.sort-list');
      ul.onclick = e => {
        const b = e.target.closest('[data-move]');
        if (!b) return;
        const i = +b.dataset.move, j = i + +b.dataset.dir;
        [order[i], order[j]] = [order[j], order[i]];
        ul.innerHTML = list();
        ul.querySelector(`[data-move="${j}"][data-dir="${b.dataset.dir}"]`)?.focus() || ul.querySelector(`[data-move="${j}"]`)?.focus();
      };
    },
  });
  if (v) reorderChapters(order);
  return v;
}
