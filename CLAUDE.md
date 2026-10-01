# Receptbok – projektspecifikation

Personlig receptbok som PWA (progressive web app) för Android/Chrome. En enda användare, all data lokalt på telefonen. Ägaren har ingen kodningserfarenhet – se "Arbetsregler" nedan.

## Mål
- Snabbt hitta och visa recept i köket (sök först, skärmen hålls tänd).
- Utveckla recept iterativt med versioner, testkommentarer och historik – och "låsa" dem när de är klara.
- Ha flera varianter av samma recept (t.ex. "Stor", "Grov").
- Dela recept som ren text via Androids delningsmeny.

## Tekniska val (ändra inte utan att fråga)
- **Ren HTML/CSS/JavaScript med ES-moduler. Inget byggsteg, inget ramverk, ingen npm-baserad build.** Koden ska kunna publiceras direkt från repots rot via GitHub Pages.
- **Lagring:** IndexedDB via ett litet eget wrapper-lager (`db.js`). Om ett bibliotek behövs (t.ex. Dexie) ska det ligga *lokalt i repot* (inte CDN) så att appen fungerar offline.
- Anropa `navigator.storage.persist()` vid start för att minska risken att webbläsaren rensar datan.
- **PWA:** `manifest.webmanifest` (namn "Receptbok", standalone, ikoner 192/512, temafärg), service worker som cachar alla filer för offline. Service workerns cache-namn ska innehålla ett versionsnummer som höjs vid varje release, så uppdateringar når telefonen. Visa en diskret "Ny version finns – ladda om"-banner.
- **Skärmen tänd:** Screen Wake Lock API i kokläge. Återaktivera låset vid `visibilitychange` (det släpps när appen göms).
- **Dela:** Web Share API (`navigator.share({ title, text })`), med fallback till kopiering till urklipp.
- Mobile-first, en kolumn, stora tryckytor (min 44px), fungerar med ljust och mörkt läge (`prefers-color-scheme`).
- Allt UI på svenska.

## Design och känsla
Appen ska kännas modern, lugn och "kokboksaktig" – mer som en välgjord kokbok än som ett formulär eller en att göra-lista.

**Visuell riktning**
- Varm, dämpad palett: off-white/papperston som bakgrund (inte rent vitt), mörk varm text (inte rent svart), en accentfärg i varm ton (t.ex. terrakotta, olivgrön eller djup senapsgul). Mörkt läge ska vara varmt mörkt, inte blågrått.
- Typografi: en karaktärsfull serif för rubriker och recepttitlar (t.ex. Fraunces eller Newsreader), en ren sans-serif för brödtext och ingredienser (t.ex. Inter eller Atkinson Hyperlegible). Typsnitt ska ligga lokalt i repot (woff2, bara de vikter som används) så de fungerar offline – inga Google Fonts-anrop.
- Generöst med luft, tydlig hierarki, få linjer och ramar. Kort med mjuka hörn och mycket subtila skuggor.
- Ingredienser: mängd och enhet visuellt separerade från namnet (t.ex. högerställda tabulära siffror i egen kolumn), så de går att läsa på armlängds avstånd. Kokläget ska vara tydligt större.
- Kapitel kan ha en valfri emoji eller ikon och en accentfärg som syns på kapitelkort och receptkort.
- Status "Under utveckling" visas med ett diskret märke och en lätt annorlunda ton i receptvyn (t.ex. anteckningsblocks-känsla), så det är uppenbart om man tittar på ett låst eller ett pågående recept.
- Tomma lägen (inga recept, inga sökträffar) ska ha en vänlig text och en tydlig nästa handling.
- Ikoner: ett enda konsekvent, lätt ikonset (inline-SVG, t.ex. Lucide), lokalt i repot.
- Använd CSS-variabler (design tokens) för färger, typografi, avstånd och radier så att utseendet kan justeras på ett ställe.

**Snabbhet ("snappy")**
- Appen ska kännas omedelbar. Mål på en vanlig mellanklass-Android:
  - Från ikon till sökbar startsida: under 1 sekund (efter första installationen).
  - Sökresultat uppdateras utan märkbar fördröjning medan man skriver (under ~50 ms med 1 000 recept). Bygg vid behov ett sökindex i minnet vid start.
  - Varje tryck ger visuell respons direkt (under 100 ms).
- Spara automatiskt vid redigering (debounce) – ingen "Spara"-knapp som måste kommas ihåg, men tydlig "Sparat"-indikering. Ångra borttagning via snackbar ("Receptet togs bort – Ångra").
- Inga laddningssnurror för lokala data. Ingen layoutförskjutning när innehåll laddas.
- Navigering som en app: mjuka övergångar (View Transitions API där det stöds, annars korta CSS-övergångar 150–250 ms). Bakåtknappen på Android ska fungera som förväntat (använd History API).
- Respektera `prefers-reduced-motion`.
- Håll JavaScript litet och ladda bara det som behövs för startsidan först.

**Innan Fas 1 byggs:** ta fram ett designförslag som en statisk HTML-sida med startsida (med sök och kapitel), en receptvy och kokläget, i både ljust och mörkt läge, med påhittade exempelrecept. Visa den för godkännande innan resten byggs.

## Datamodell

Alla objekt har `id` (UUID), `createdAt`, `updatedAt` (ISO-strängar). Databasen har ett `schemaVersion`-nummer; ändringar i modellen kräver en migrering (se Arbetsregler).

```
Chapter
  id, name, sortOrder

Recipe
  id, title, chapterId, tags[], description?, defaultVariantId, lastViewedAt?

Variant
  id, recipeId, name            // t.ex. "Standard", "Stor", "Grov"
  status: "development" | "locked"
  currentVersionId
  sortOrder

Version
  id, variantId, number         // 1, 2, 3 … per variant
  ingredients: [
    { id, group?, amount: number|null, unit, name, note? }
  ]                             // group t.ex. "Deg", "Fyllning"
  steps: [ { id, group?, text } ]
  servings?: string             // fritext, t.ex. "2 bröd"
  changeNote?: string           // vad som ändrades jämfört med förra versionen
  basedOnVersionId?             // vilken version den kopierades från
  frozen: boolean               // true = går inte att redigera

TestLog
  id, versionId, date, rating?: 1–5, text
```

Regler:
- Ett recept har minst en variant ("Standard" skapas automatiskt).
- Varje variant har sin egen versionskedja. En ny variant skapas genom att kopiera valfri version från en annan variant (blir v1 i den nya varianten, `basedOnVersionId` sparas).
- Bara den senaste versionen i en variant under utveckling är redigerbar. När en ny version skapas fryses den föregående.
- **Låsa:** variantens status blir `locked`, aktuell version fryses. Receptvyn visar då bara ingredienser och instruktioner – inga testloggar eller utvecklingsverktyg. Historiken nås via meny ("Visa historik"), om fler än en version finns.
- **Lås upp:** sätter status till `development` och skapar en ny redigerbar version baserad på den låsta.
- Ett recept räknas som "under utveckling" i listor om någon av dess varianter är det.

## Skärmar

### Startsida
- Sökfält överst, i fokus vid start. Söker medan man skriver i titel, ingredienser, kapitel och taggar (aktuell version av varje variant).
- Skiftlägesokänsligt, delsträngsmatchning, enkel stavfelstolerans. å/ä/ö behandlas som egna bokstäver men sökningen ska fungera om man skriver dem korrekt. Titelträffar rankas högst, sedan ingrediensträffar. Visa *varför* ett recept matchade (t.ex. "ingrediens: kardemumma").
- Under sökfältet när det är tomt: kapitel som kort/lista, samt "Senast visade" och "Under utveckling".

### Kapitel
- Lista recept i kapitlet. Skapa, byta namn på, sortera och ta bort kapitel (ta bort bara om tomt, eller fråga vart recepten ska flyttas).

### Receptvy
- Titel, variantväljare (chips/flikar) om fler än en variant finns, status-märke om under utveckling.
- Toggle/flikar: **Ingredienser** | **Instruktioner**.
- Ingredienser grupperade efter `group`. Tryck för att bocka av (tillfälligt, sparas inte).
- Instruktioner som numrerade steg, tryck för att markera som gjort.
- **Kokläge-knapp:** aktiverar wake lock, större text. Tydlig indikator att skärmen hålls tänd. Stängs av när man lämnar receptet.
- **Dela-knapp** (se textformat nedan).
- Meny: Redigera / Ny version / Logga test / Ny variant / Lås / Lås upp / Visa historik / Flytta till kapitel / Ta bort.

### Utvecklingsläge (variant med status development)
- Visar aktuell version + testloggar för den versionen.
- **Logga test:** datum (förvalt idag), valfritt betyg 1–5, fritext.
- **Ny version:** kopierar aktuell version till redigeringsvyn. Testloggarna från föregående version visas synligt (t.ex. ovanför eller i hopfällbar panel) medan man redigerar. Fält för "Vad ändrade du?" (`changeNote`).

### Redigera recept/version
- Ingredienser: rader med mängd, enhet, namn, anteckning, grupp. Lägga till, ta bort, flytta. Snabbinmatning: klistra in flera rader text och tolka "500 g vetemjöl" → amount/unit/name (best effort, användaren kan korrigera).
- Steg: lägga till, ta bort, flytta, gruppera.

### Historik
- Lista alla versioner för varianten: nummer, datum, changeNote, antal tester, snittbetyg.
- Öppna en version (skrivskyddad) med dess testloggar.
- **Jämför två versioner:** diff med färgmarkering – tillagda, borttagna och ändrade ingredienser (t.ex. "Vatten 350 g → 380 g") och ändrade steg.

### Inställningar
- **Exportera backup:** hela databasen som JSON-fil (`receptbok-backup-ÅÅÅÅ-MM-DD.json`).
- **Importera backup:** ersätt allt (med bekräftelse) eller slå ihop.
- Visa datum för senaste export och påminn diskret om backup om det gått mer än 30 dagar.

## Dela – textformat
```
Surdegsbröd – Grov
(2 bröd)

INGREDIENSER
Deg:
- 450 g vetemjöl
- 50 g fullkornsråg
- 380 g vatten

INSTRUKTIONER
1. Blanda mjöl och vatten, autolys 1 h.
2. …
```
Variantnamn tas bara med om receptet har fler än en variant. Inga testloggar eller versionsinfo delas.

## Faser och acceptanskriterier

**Fas 1 – MVP**
- Designförslag godkänt (se "Design och känsla").
- Prestandamålen under "Snabbhet" uppfylls.
- PWA installerbar via Chrome på Android och fungerar offline.
- Kapitel (skapa/byta namn/sortera/ta bort), recept med en variant och en version, redigering av ingredienser och steg.
- Sök på startsidan enligt ovan.
- Receptvy med toggle, avbockning, kokläge (wake lock) och dela.
- Export/import av backup.
- Publicerat via GitHub Pages.

**Fas 2 – Utveckling och versioner**
- Status development/locked, logga test, ny version med föregående testloggar synliga, lås/lås upp, historik och diff.

**Fas 3 – Varianter och extra**
- Flera varianter per recept, skapa variant från befintlig version.
- Därefter vid önskemål: skalning av portioner, bagarprocent, foto per version, timers i steg.

## Arbetsregler för Claude
- Ägaren kodar inte. Förklara kort på svenska efter varje uppgift: vad som gjorts, hur man testar det på telefonen och om något behöver göras manuellt.
- Planera innan större ändringar och vänta på godkännande. Bygg en fas i taget.
- Små, tydliga commits med beskrivande meddelanden på svenska.
- **Användarens data får aldrig gå förlorad.** Ändringar i datamodellen kräver: höjt `schemaVersion`, en migrering som körs automatiskt vid start, och en automatisk backup-nedladdning eller tydlig uppmaning att exportera innan migreringen körs.
- Höj service workerns cache-version vid varje release.
- Testa layouten i mobilbredd (360–412px). Inga horisontella scrollbars.
- Lägg inte till ramverk, byggsteg, externa tjänster, konton eller spårning utan att fråga.
- Håll `README.md` uppdaterad med: hur appen publiceras, hur man installerar den på telefonen och hur man gör backup.
- Repot är publikt. Inga riktiga recept, backupfiler eller personliga uppgifter får läggas i repot – bara påhittade exempelrecept. Lägg till `*backup*.json` i `.gitignore`.
