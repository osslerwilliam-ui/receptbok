// Utseende: ljust/mörkt läge och färgtema. Valen sparas i webbläsaren (localStorage)
// och läses redan i index.html så att sidan inte blinkar vid start.

const MODE_KEY = 'receptbok-tema';
const PALETTE_KEY = 'receptbok-palett';

/** Färgteman. Färgerna i sin helhet finns i css/tokens.css (Terrakotta) och css/themes.css. */
export const PALETTES = {
  "terrakotta": {
    "name": "Terrakotta",
    "desc": "Papper och bränd lera – det nuvarande.",
    "light": {
      "bg": "#f5efe4",
      "title": "#2f2621",
      "accent": "#b0502c",
      "accent-soft": "#f4ddd0"
    },
    "dark": {
      "bg": "#1c1714",
      "title": "#f0e6d9",
      "accent": "#e27e57",
      "accent-soft": "#48291c"
    }
  },
  "herbarium": {
    "name": "Herbarium",
    "desc": "Salvia och oliv, elegant antikva och mjuka, runda former.",
    "light": {
      "bg": "#f1efe6",
      "title": "#3a4526",
      "accent": "#5f6b33",
      "accent-soft": "#e1e6cf"
    },
    "dark": {
      "bg": "#191b15",
      "title": "#dfe5c4",
      "accent": "#a9b872",
      "accent-soft": "#33391f"
    }
  },
  "serios": {
    "name": "Seriös",
    "desc": "Svartvitt och stramt, som ett tryckt dokument.",
    "light": {
      "bg": "#ffffff",
      "title": "#111111",
      "accent": "#111111",
      "accent-soft": "#ebebeb"
    },
    "dark": {
      "bg": "#0f0f0f",
      "title": "#ececec",
      "accent": "#ececec",
      "accent-soft": "#2a2a2a"
    }
  }
};

const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, val) => {
  try { if (val == null) localStorage.removeItem(key); else localStorage.setItem(key, val); } catch { /* bara för den här gången */ }
};

export function getTheme() { return read(MODE_KEY) || 'system'; }
// Borttagna teman: Olivlund blev Herbarium, övriga faller tillbaka på Terrakotta.
const RENAMED = { olivlund: 'herbarium' };
export function getPalette() { const raw = read(PALETTE_KEY); const p = RENAMED[raw] || raw; return PALETTES[p] ? p : 'terrakotta'; }

export function setTheme(mode) {
  write(MODE_KEY, mode === 'system' ? null : mode);
  apply();
}

export function setPalette(id) {
  write(PALETTE_KEY, id === 'terrakotta' ? null : id);
  apply();
}

export function apply() {
  const root = document.documentElement;
  const mode = getTheme();
  const palette = getPalette();
  if (mode === 'light' || mode === 'dark') root.dataset.theme = mode;
  else delete root.dataset.theme;
  if (palette === 'terrakotta') delete root.dataset.palette;
  else root.dataset.palette = palette;
  // Statusfältets färg i Android följer temats bakgrund.
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    const scheme = mode === 'system' ? (m.media.includes('dark') ? 'dark' : 'light') : mode;
    m.content = PALETTES[palette][scheme].bg;
  });
}
