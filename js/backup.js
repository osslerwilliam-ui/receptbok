// Export och import av backup (hela databasen som en JSON-fil).

import * as db from './db.js';
import { STORES } from './db.js';
import { SCHEMA_VERSION, migrateData } from './migrate.js';
import { state, snapshot, setAll } from './store.js';
import { isoDay } from './format.js';

export function buildBackup(data = snapshot(), schemaVersion = SCHEMA_VERSION) {
  return { app: 'receptbok', schemaVersion, exportedAt: new Date().toISOString(), data };
}

export function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function exportBackup() {
  downloadJSON(buildBackup(), `receptbok-backup-${isoDay()}.json`);
  const t = new Date().toISOString();
  await db.setMeta('lastExportAt', t);
  return t;
}

/** Läser och kontrollerar en backupfil. Kastar ett Error med svensk förklaring om något är fel. */
export function parseBackup(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('Filen är inte en giltig backup (kunde inte läsas som JSON).'); }
  if (!obj || obj.app !== 'receptbok' || typeof obj.data !== 'object') throw new Error('Filen verkar inte vara en backup från Receptbok.');
  const v = Number(obj.schemaVersion) || 1;
  if (v > SCHEMA_VERSION) throw new Error('Backupen kommer från en nyare version av appen. Ladda om appen och försök igen.');
  const data = {};
  for (const name of STORES) {
    const list = obj.data[name] || [];
    if (!Array.isArray(list)) throw new Error('Backupfilen är skadad.');
    data[name] = list.filter(o => o && typeof o.id === 'string');
  }
  return { data: migrateData(data, v), exportedAt: obj.exportedAt, counts: { recipes: data.recipes.length, chapters: data.chapters.length } };
}

/** mode: 'replace' ersätter allt, 'merge' lägger till nytt och behåller det nyaste av dubbletter. */
export async function importBackup(parsed, mode) {
  let next;
  if (mode === 'replace') {
    next = parsed.data;
  } else {
    next = {};
    for (const name of STORES) {
      const map = new Map(state[name]);
      for (const obj of parsed.data[name]) {
        const cur = map.get(obj.id);
        if (!cur || (obj.updatedAt || '') > (cur.updatedAt || '')) map.set(obj.id, obj);
      }
      next[name] = [...map.values()];
    }
  }
  await db.replaceAll(next);
  setAll(await db.readAll());
}
