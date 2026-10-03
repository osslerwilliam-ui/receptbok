// Datamodellens version och migreringar.
//
// Så gör man en ändring i datamodellen:
// 1. Höj SCHEMA_VERSION med 1.
// 2. Lägg till en funktion i MIGRATIONS med det nya numret som nyckel. Den får hela datan
//    ({ chapters, recipes, variants, versions, testlogs }) och ska returnera den uppdaterade datan.
// 3. Vid start körs migreringen automatiskt. Innan den körs laddas en backup ned och en kopia
//    sparas i databasen (se app.js), så att ingen data kan gå förlorad.

export const SCHEMA_VERSION = 6;

export const MIGRATIONS = {
  // Fas 2: status och frysta versioner används på riktigt.
  // Recept från Fas 1 är "klara" (låsta): deras aktuella version fryses.
  2: data => {
    const locked = new Set(data.variants.filter(v => v.status !== 'development').map(v => v.currentVersionId));
    for (const v of data.variants) if (v.status !== 'development') v.status = 'locked';
    for (const ver of data.versions) {
      ver.frozen = ver.frozen === true || locked.has(ver.id);
      ver.changeNote ??= '';
      ver.basedOnVersionId ??= null;
    }
    return data;
  },
  // Fas 3: testloggar kan ha foton (id:n till fototabellen).
  3: data => {
    for (const l of data.testlogs) if (!Array.isArray(l.photos)) l.photos = [];
    return data;
  },
  // Favoritmarkerade recept.
  4: data => {
    for (const r of data.recipes) r.favorite = r.favorite === true;
    return data;
  },
  // Inköpslistor (ny tabell).
  5: data => {
    data.lists = Array.isArray(data.lists) ? data.lists : [];
    return data;
  },
  // Egen ordning för favoriter (favOrder) och inköpslistor (sortOrder).
  6: data => {
    const coll = (a, b) => (a || '').localeCompare(b || '', 'sv');
    data.recipes.filter(r => r.favorite).sort((a, b) => coll(a.title, b.title)).forEach((r, i) => { r.favOrder ??= i; });
    data.lists.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).forEach((l, i) => { l.sortOrder ??= i; });
    return data;
  },
};

export function migrateData(data, fromVersion) {
  let d = data;
  for (let v = fromVersion + 1; v <= SCHEMA_VERSION; v++) {
    if (MIGRATIONS[v]) d = MIGRATIONS[v](d);
  }
  return d;
}
