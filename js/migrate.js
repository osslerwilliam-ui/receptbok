// Datamodellens version och migreringar.
//
// Så gör man en ändring i datamodellen:
// 1. Höj SCHEMA_VERSION med 1.
// 2. Lägg till en funktion i MIGRATIONS med det nya numret som nyckel. Den får hela datan
//    ({ chapters, recipes, variants, versions, testlogs }) och ska returnera den uppdaterade datan.
// 3. Vid start körs migreringen automatiskt. Innan den körs laddas en backup ned och en kopia
//    sparas i databasen (se app.js), så att ingen data kan gå förlorad.

export const SCHEMA_VERSION = 1;

export const MIGRATIONS = {
  // Exempel för framtiden:
  // 2: (data) => { for (const r of data.recipes) r.nyttFält ??= null; return data; },
};

export function migrateData(data, fromVersion) {
  let d = data;
  for (let v = fromVersion + 1; v <= SCHEMA_VERSION; v++) {
    if (MIGRATIONS[v]) d = MIGRATIONS[v](d);
  }
  return d;
}
