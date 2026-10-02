// Litet lager ovanpå IndexedDB. All data ligger lokalt i webbläsaren på telefonen.
//
// DB_VERSION gäller bara databasens struktur (vilka "tabeller" som finns).
// Datamodellens version (schemaVersion) sparas i meta-tabellen och hanteras i migrate.js.

const DB_NAME = 'receptbok';
const DB_VERSION = 1;

export const STORES = ['chapters', 'recipes', 'variants', 'versions', 'testlogs'];

let dbPromise = null;

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => {
        const db = req.result;
        // Om en nyare flik uppgraderar databasen: stäng denna anslutning så att den inte blockerar.
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaktionen avbröts'));
  });
}

/** Läser allt innehåll i en enda transaktion: { chapters: [...], recipes: [...], ... } */
export async function readAll() {
  const db = await openDB();
  const tx = db.transaction(STORES, 'readonly');
  const out = {};
  for (const name of STORES) {
    const req = tx.objectStore(name).getAll();
    req.onsuccess = () => { out[name] = req.result; };
  }
  await done(tx);
  return out;
}

/**
 * Skriver flera ändringar atomiskt (allt eller inget).
 * ops: [{ store, put: obj }] eller [{ store, del: id }]
 */
export async function write(ops) {
  if (!ops.length) return;
  const db = await openDB();
  const names = [...new Set(ops.map(o => o.store))];
  const tx = db.transaction(names, 'readwrite');
  for (const op of ops) {
    const s = tx.objectStore(op.store);
    if (op.put) s.put(op.put);
    else if (op.del) s.delete(op.del);
  }
  return done(tx);
}

/** Ersätter allt innehåll med `data` (används vid import och migrering). */
export async function replaceAll(data) {
  const db = await openDB();
  const tx = db.transaction(STORES, 'readwrite');
  for (const name of STORES) {
    const s = tx.objectStore(name);
    s.clear();
    for (const obj of data[name] || []) s.put(obj);
  }
  return done(tx);
}

export async function getMeta(key) {
  const db = await openDB();
  const tx = db.transaction('meta', 'readonly');
  const req = tx.objectStore('meta').get(key);
  await done(tx);
  return req.result ? req.result.value : undefined;
}

export async function setMeta(key, value) {
  const db = await openDB();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ key, value });
  return done(tx);
}
