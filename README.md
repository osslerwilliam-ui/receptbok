# Receptbok

En personlig receptbok som app i mobilen (PWA). Den fungerar utan internet och all data sparas bara på telefonen.

Appen finns på: **https://osslerwilliam-ui.github.io/receptbok/** (när GitHub Pages är påslaget, se nedan).

## Publicera appen (GitHub Pages)

Det här behöver bara göras en gång.

1. Gå till repot på github.com: `osslerwilliam-ui/receptbok`.
2. Klicka på **Settings** (kugghjulet högst upp i repot).
3. Välj **Pages** i menyn till vänster.
4. Under **Build and deployment** väljer du:
   - **Source:** *Deploy from a branch*
   - **Branch:** `main` och mappen `/ (root)`. Klicka **Save**.
5. Vänta 1–2 minuter och ladda om sidan. Överst visas då adressen till appen,
   `https://osslerwilliam-ui.github.io/receptbok/`.

Efter det publiceras varje ändring som hamnar i `main` automatiskt inom några minuter.

## Installera på Android-telefonen

1. Öppna **Chrome** på telefonen och gå till `https://osslerwilliam-ui.github.io/receptbok/`.
2. Tryck på menyn **⋮** uppe till höger.
3. Välj **Installera app** (står det *Lägg till på startskärmen* fungerar det också).
4. Bekräfta med **Installera**. Ikonen *Receptbok* hamnar bland dina appar och på startskärmen.
5. Öppna appen från ikonen. Den startar i helskärm och fungerar utan internet.

**Uppdateringar:** när en ny version finns visas en liten ruta *"Ny version finns – Ladda om"* högst upp. Tryck på **Ladda om**. Ibland behöver appen öppnas två gånger innan rutan dyker upp.

## Backup – viktigt!

Recepten finns **bara på telefonen**. Om du byter telefon, avinstallerar appen eller rensar Chromes webbplatsdata försvinner de. Gör därför backup ibland:

1. Öppna appen och tryck på **kugghjulet** uppe till höger på startsidan.
2. Tryck **Exportera backup**. Har du foton i testloggarna får du välja *Med foton* (större fil) eller *Utan foton*. En fil som heter `receptbok-backup-ÅÅÅÅ-MM-DD.json` sparas i *Hämtade filer* (Downloads).
3. Spara gärna filen någon annanstans också, t.ex. i Google Drive eller som bilaga i ett mejl till dig själv.

Appen påminner dig på startsidan om det gått mer än 30 dagar sedan senaste backup.

**Återställa:** Inställningar → **Importera backup** → välj filen. Du kan välja
- **Slå ihop** – lägger till det som saknas och behåller det senast ändrade, eller
- **Ersätt allt** – tar bort allt i appen och lägger in backupen i stället. En säkerhetskopia av det som fanns laddas ned först.

Lägg aldrig backupfiler i det här repot – det är publikt. (`*backup*.json` är spärrat i `.gitignore`.)

## Så används appen

- **Startsidan:** sök direkt i rutan överst. Sökningen hittar titlar, ingredienser, taggar och kapitel och klarar enkla stavfel. Under rutan finns kapitlen, senast visade recept och recept under utveckling.
- **Kapitel:** skapa med *Nytt kapitel*. Byt namn, ikon och färg eller ta bort via **⋮** inne i kapitlet. Ordningen ändras med *Sortera* på startsidan.
- **Nytt recept:** gå in i ett kapitel och tryck **Nytt recept**. Allt sparas automatiskt medan du skriver. När du trycker *Klar* första gången frågar appen om receptet är färdigt: **Lås som klart** eller **Fortsätt utveckla**.
- **Redigera:** överst namn, kapitel och taggar. Därunder växlar du mellan flikarna *Ingredienser* och *Instruktioner*. Håll fingret på **⋮** till höger om en rad och dra för att flytta den, eller tryck kort på **⋮** för att flytta upp/ned eller ta bort.
- **Klistra in:** under Ingredienser och Instruktioner finns *Klistra in*. Klistra in flera rader på en gång, t.ex. `500 g vetemjöl`. En rad som slutar med kolon (`Deg:`) blir en grupp.
- **Receptvyn:** växla mellan *Ingredienser* och *Instruktioner*. Tryck på en rad för att bocka av den. Avbockningarna nollställs när du lämnar receptet.
- **Skala:** tryck *Skala* under receptets titel för att tillfälligt ändra mängderna (½×, 1½×, 2× …, eget tal eller antal portioner). Gäller även kokläget och delning, och nollställs när du lämnar receptet.
- **Kokläge:** större text och skärmen hålls tänd. Lämna läget med krysset eller bakåtknappen.
- **Dela:** dela-ikonen uppe till höger i receptet skickar det som text via Androids delningsmeny.
- **Ljust eller mörkt läge:** kugghjulet → *Utseende* → Som telefonen, Ljust eller Mörkt.
- **Ta bort:** via **⋮** i receptet. Du kan ångra direkt i rutan som visas längst ner.

### Varianter

Ett recept kan ha flera varianter, t.ex. *Standard*, *Stor form* och *Med frön*. De visas som knappar under titeln – tryck för att byta.

- **Ny variant:** **⋮** → *Ny variant*. Ge den ett namn och välj vilken version den ska utgå från. Varianten blir en egen kopia med egna versioner och tester (ändringar i en variant påverkar inte de andra).
- **Byt namn, visa först eller ta bort:** **⋮** → *Variant ”…”*. Den sista varianten kan inte tas bort.

### Utveckla recept (versioner och tester)

Ett recept är antingen **under utveckling** (gulaktig anteckningsblockston, märket *Under utveckling · v3*) eller **klart (låst)**.

- **Logga test:** efter att du lagat receptet – datum, betyg 1–5, en kommentar och gärna foton (kamera eller galleri). Testerna syns längst ner i receptet och det senaste högst upp. Tryck på ett test för att ändra eller ta bort det.
- **Ny version:** kopierar receptet till nästa version (t.ex. v4) och fryser den förra. Medan du redigerar ser du testerna från förra versionen och fyller i *Vad ändrade du?*. Ändrar du ingenting sparas ingen ny version.
- **Lås – markera som klart:** via **⋮**. Då visas bara ingredienser och instruktioner.
- **Lås upp:** via **⋮** på ett klart recept. Receptet blir under utveckling igen och du fortsätter på den senaste versionen – ingen ny version skapas. Vill du ha en ny version trycker du *Ny version*.
- **Snabbrättning:** tryck *Redigera* på ett klart recept och välj *Snabbrättning* för stavfel och små ändringar – ingen ny version skapas.
- **Visa historik:** via **⋮** när det finns fler än en version. Där ser du alla versioner med datum, vad som ändrades, antal tester och snittbetyg. Öppna en version för att se den (skrivskyddad) med dess tester, eller tryck **Jämför två versioner** för att se vad som lagts till (grönt), tagits bort (rött) och ändrats (gult).

## Om appen visar en tom sida

**Rensa aldrig Chromes data för sidan och avinstallera inte appen – då försvinner recepten.** Gör så här i stället:

1. Stäng Receptbok helt (svep bort den bland öppna appar) och stäng alla Chrome-flikar där Receptbok är öppen. Öppna sedan appen igen.
2. Startar den fortfarande inte visas efter några sekunder rutan *"Receptboken startar inte"*. Tryck **Reparera appen** (kräver internet). Appens programfiler hämtas på nytt – recepten påverkas inte.

## För utveckling

- Ren HTML/CSS/JavaScript (ES-moduler) utan byggsteg. Allt ligger i repots rot och publiceras som det är.
- Testa lokalt: kör `python3 -m http.server` i repots mapp och öppna `http://localhost:8000`.
- **Vid varje release:** höj `VERSION` i `sw.js`, annars når uppdateringen inte telefonen. Lägg till nya filer i listan `FILES` i `sw.js`.
- **Ändrad datamodell:** höj `SCHEMA_VERSION` och lägg till en migrering i `js/migrate.js`. Vid start sparas då automatiskt en backup innan migreringen körs.
- Utseendet styrs av `css/tokens.css` (färger, typsnitt, avstånd).
- `design/` innehåller det godkända designförslaget.

| Fil | Innehåll |
| --- | --- |
| `index.html`, `manifest.webmanifest`, `sw.js` | Appens skal, installation och offline |
| `js/app.js` | Start, migrering och uppdateringsbanner |
| `js/db.js`, `js/store.js`, `js/migrate.js` | Lagring (IndexedDB) och datamodell |
| `js/search.js` | Sökning |
| `js/views/` | Skärmarna: start, kapitel, recept/kokläge, redigera, inställningar |
| `fonts/`, `icons/` | Typsnitt (Fraunces, Inter – OFL) och ikoner (Lucide – ISC) |
