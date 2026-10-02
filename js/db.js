// Litet lager ovanpå IndexedDB. All data ligger lokalt i webbläsaren på telefonen.
//
// DB_VERSION gäller bara databasens struktur (vilka "tabeller" som finns).
// Datamodellens version (schemaVersion) sparas i meta-tabellen och hanteras i migrate.js.

const DB_NAME = 'receptbok';
const DB_VERSION = 2; // 2: tabell för foton

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
        // Foton ligger i en egen tabell och läses bara när de ska visas (de är stora).
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
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

/* ---------- Foton ---------- */
// Ett foto: { id, testlogId, blob, type, width, height, createdAt }

export async function putPhotos(photos) {
  if (!photos.length) return;
  const db = await openDB();
  const tx = db.transaction('photos', 'readwrite');
  for (const ph of photos) tx.objectStore('photos').put(ph);
  return done(tx);
}

export async function getPhoto(id) {
  const db = await openDB();
  const tx = db.transaction('photos', 'readonly');
  const req = tx.objectStore('photos').get(id);
  await done(tx);
  return req.result || null;
}

export async function getAllPhotos() {
  const db = await openDB();
  const tx = db.transaction('photos', 'readonly');
  const req = tx.objectStore('photos').getAll();
  await done(tx);
  return req.result;
}

export async function deletePhotos(ids) {
  if (!ids.length) return;
  const db = await openDB();
  const tx = db.transaction('photos', 'readwrite');
  for (const id of ids) tx.objectStore('photos').delete(id);
  return done(tx);
}

export async function clearPhotos() {
  const db = await openDB();
  const tx = db.transaction('photos', 'readwrite');
  tx.objectStore('photos').clear();
  return done(tx);
}

/** Tar bort foton som inte hör till någon testlogg längre (t.ex. efter borttagning). */
export async function deleteOrphanPhotos(validTestlogIds) {
  const db = await openDB();
  const tx = db.transaction('photos', 'readwrite');
  const store = tx.objectStore('photos');
  let removed = 0;
  store.openCursor().onsuccess = e => {
    const cur = e.target.result;
    if (!cur) return;
    if (!validTestlogIds.has(cur.value.testlogId)) { cur.delete(); removed++; }
    cur.continue();
  };
  await done(tx);
  return removed;
}
