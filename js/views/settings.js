// Inställningar: backup (export/import) och information om appen.

import { icon, esc, $, sheet, confirmSheet, snack } from '../ui.js';
import { state, meta } from '../store.js';
import { exportBackup, parseBackup, importBackup, buildBackup, downloadJSON } from '../backup.js';
import { fmtDate, isoDay } from '../format.js';
import { back } from '../router.js';

export function render(root) {
  root.innerHTML = `
    <div class="appbar">
      <button type="button" class="icon-btn" data-action="back" aria-label="Tillbaka">${icon('chevron-left')}</button>
    </div>
    <div class="page settings">
      <header class="page-head"><h1 class="page-title">Inställningar</h1></header>

      <section class="card">
        <h2 class="card-title">${icon('hard-drive-download')}Backup</h2>
        <p>Recepten finns bara på den här telefonen. Spara en backup ibland, till exempel i Google Drive, så att inget går förlorat om telefonen byts ut eller webbläsarens data rensas.</p>
        <p class="muted" id="last-export"></p>
        <div class="btn-col">
          <button type="button" class="btn btn-primary" data-action="export">${icon('download')}Exportera backup</button>
          <button type="button" class="btn btn-quiet" data-action="import">${icon('upload')}Importera backup</button>
        </div>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </section>

      <section class="card">
        <h2 class="card-title">${icon('info')}Om appen</h2>
        <dl class="facts">
          <dt>Recept</dt><dd>${state.recipes.size}</dd>
          <dt>Kapitel</dt><dd>${state.chapters.size}</dd>
          <dt>Version</dt><dd id="app-version">–</dd>
          <dt>Lagring</dt><dd id="persist">–</dd>
        </dl>
      </section>
    </div>`;

  const drawLast = () => {
    $('#last-export', root).textContent = meta.lastExportAt ? `Senaste export: ${fmtDate(meta.lastExportAt)}` : 'Du har inte exporterat någon backup än.';
  };
  drawLast();

  // Versionen läses från service workerns cache-namn (receptbok-v…)
  if ('caches' in window) {
    caches.keys().then(keys => {
      const k = keys.filter(x => x.startsWith('receptbok-v')).sort().pop();
      if (k) $('#app-version', root).textContent = k.replace('receptbok-v', '');
    }).catch(() => {});
  }
  navigator.storage?.persisted?.().then(p => {
    $('#persist', root).textContent = p ? 'Skyddad mot automatisk rensning' : 'Inte skyddad – gör backup regelbundet';
  }).catch(() => {});

  const fileInput = $('#import-file', root);
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    let parsed;
    try { parsed = parseBackup(await file.text()); } catch (err) { snack(err.message, { duration: 7000 }); return; }
    const mode = await sheet({
      title: 'Importera backup',
      body: `<p class="sheet-text">Backupen innehåller ${parsed.counts.recipes} recept och ${parsed.counts.chapters} kapitel${parsed.exportedAt ? ` och skapades ${esc(fmtDate(parsed.exportedAt))}` : ''}.</p>
        <p class="sheet-text"><b>Slå ihop</b> lägger till det som saknas och behåller det senast ändrade. <b>Ersätt allt</b> tar bort allt som finns i appen nu.</p>`,
      actions: [
        { label: 'Avbryt', value: null },
        { label: 'Ersätt allt', value: 'replace', kind: 'danger' },
        { label: 'Slå ihop', value: 'merge', kind: 'primary' },
      ],
    });
    if (!mode) return;
    if (mode === 'replace' && !await confirmSheet({
      title: 'Ersätta allt?',
      text: `Alla ${state.recipes.size} recept och ${state.chapters.size} kapitel i appen ersätts med innehållet i backupen. En säkerhetskopia av det nuvarande innehållet laddas ned först.`,
      ok: 'Ersätt allt', danger: true,
    })) return;
    try {
      // Säkerhetskopia av nuvarande innehåll innan det ersätts.
      if (mode === 'replace' && state.recipes.size) downloadJSON(buildBackup(), `receptbok-backup-fore-import-${isoDay()}.json`);
      await importBackup(parsed, mode);
      snack(mode === 'replace' ? 'Backupen är importerad' : 'Backupen är sammanslagen');
      render(root);
    } catch (err) {
      console.error(err);
      snack('Importen misslyckades. Inget har ändrats.');
    }
  }, { once: false });

  root.onclick = async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const a = btn.dataset.action;
    if (a === 'back') back();
    else if (a === 'export') {
      meta.lastExportAt = await exportBackup();
      drawLast();
      snack('Backupen är sparad i Hämtade filer');
    } else if (a === 'import') fileInput.click();
  };
}
