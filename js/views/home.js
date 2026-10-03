// Startsida: sök, kapitel, senast visade och under utveckling.

import { icon, esc, $, sheet } from '../ui.js';
import { state, meta, testlogsOf, variantsOf, displayTitle, chaptersSorted, createChapter, createRecipe, reorderChapters, favoritesSorted, reorderFavorites, isInDevelopment, chapterOf, NO_CHAPTER } from '../store.js';
import { search } from '../search.js';
import { fmtRelative, fmtDate } from '../format.js';
import { recipeRow, chapterCard, noChapterCard, chapterSheet, pickChapterSheet, emptyState, colorVar, sortSheet } from '../components.js';
import { onLongPress } from '../longpress.js';
import { navigate } from '../router.js';

let query = '';
let recentOpen = false; // "Senast visade" är hopfälld tills man öppnar den

export function render(root, _params, ctx) {
  root.innerHTML = `
    <div class="page home">
      <header class="home-head">
        <h1 class="wordmark">Recept<em>bok</em></h1>
        <span class="head-actions">
          <a class="icon-btn" href="#/listor" data-link aria-label="Inköpslistor">${icon('clipboard-list')}</a>
          <a class="icon-btn" href="#/installningar" data-link aria-label="Inställningar">${icon('settings')}</a>
        </span>
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
      if (await sortChapters()) renderBrowse(browse);
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

  // Håll fingret på ett kapitel eller en favorit för att sortera om.
  onLongPress(browse, '.chapter[data-chapter], .shelf-card[data-fav]', async el => {
    const done = el.dataset.chapter ? await sortChapters(el.dataset.chapter) : await sortFavorites(el.dataset.fav);
    if (done) renderBrowse(browse);
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

  // Favoriter: vågrät rad med små kort.
  const favs = favoritesSorted();
  if (favs.length) {
    html += `<h2 class="section-title">${icon('heart', 'inline-icon fav-icon')} Favoriter</h2>
      <div class="shelf" role="list">${favs.map(r => {
        const ch = chapterOf(r);
        return `<a class="shelf-card" role="listitem" href="#/recept/${r.id}" data-link data-fav="${r.id}" style="--c: ${colorVar(ch)}">
          <span class="shelf-title">${esc(displayTitle(r))}</span>
          <span class="shelf-sub">${esc(ch?.name || 'Utan kapitel')}</span>
        </a>`;
      }).join('')}</div>`;
  }

  // Under utveckling: kompakt lista, en rad per variant.
  const dev = recipes.filter(r => isInDevelopment(r.id));
  if (dev.length) {
    html += `<h2 class="section-title">${icon('flask-conical', 'inline-icon dev-icon')} Under utveckling</h2><div class="devlist">${dev.flatMap(r => {
      const vs = variantsOf(r.id);
      return vs.filter(v => v.status === 'development').map(v => {
        const ver = state.versions.get(v.currentVersionId);
        const last = ver && testlogsOf(ver.id)[0];
        const path = vs.length > 1 ? `/recept/${r.id}/v/${v.id}` : `/recept/${r.id}`;
        return `<a class="devrow" href="#${path}" data-link>
          <span class="devrow-title">${esc(displayTitle(r))}${vs.length > 1 ? ` <span class="title-variant">– ${esc(v.name)}</span>` : ''}</span>
          <span class="devrow-meta">${ver ? `v${ver.number}` : ''}${last ? ` · ${fmtDate(last.date)}` : ' · ej testad'}</span>
        </a>`;
      });
    }).join('')}</div>`;
  }

  // Senast visade: hopfälld längst ner.
  const recent = recipes.filter(r => r.lastViewedAt).sort((a, b) => b.lastViewedAt.localeCompare(a.lastViewedAt)).slice(0, 5);
  if (recent.length) {
    html += `<details class="recent" ${recentOpen ? 'open' : ''}>
      <summary class="section-title">${icon('clock', 'inline-icon')} Senast visade<span class="recent-chev">${icon('chevron-down')}</span></summary>
      <div class="rlist">${recent.map(r =>
        recipeRow(r, { sub: `${esc(chapterOf(r)?.name || 'Utan kapitel')} · ${fmtRelative(r.lastViewedAt)}` })).join('')}</div>
    </details>`;
  }
  el.innerHTML = html;
  el.querySelector('.recent')?.addEventListener('toggle', e => { recentOpen = e.target.open; });
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

async function sortChapters(marked = null) {
  const ids = await sortSheet({
    title: 'Sortera kapitel', marked,
    items: chaptersSorted().map(c => ({ id: c.id, label: c.name })),
  });
  if (ids) reorderChapters(ids);
  return !!ids;
}

async function sortFavorites(marked = null) {
  const ids = await sortSheet({
    title: 'Sortera favoriter', marked,
    items: favoritesSorted().map(r => ({ id: r.id, label: displayTitle(r), sub: chapterOf(r)?.name || '' })),
  });
  if (ids) reorderFavorites(ids);
  return !!ids;
}
