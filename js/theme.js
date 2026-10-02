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
  "olivlund": {
    "name": "Olivlund",
    "desc": "Linne, salvia och olivgrönt med mossbruna rubriker.",
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
  "ockra": {
    "name": "Ockra & bläck",
    "desc": "Sand och senapsockra med djupt blåsvart bläck.",
    "light": {
      "bg": "#f4eedf",
      "title": "#1f2a44",
      "accent": "#b07d22",
      "accent-soft": "#f1e2bd"
    },
    "dark": {
      "bg": "#16181f",
      "title": "#e9d9b2",
      "accent": "#d9a64a",
      "accent-soft": "#3a3222"
    }
  },
  "rost": {
    "name": "Rost & dimblå",
    "desc": "Gråvit botten, rostrött och dammig blågrå.",
    "light": {
      "bg": "#eff0ec",
      "title": "#3c5263",
      "accent": "#a3432a",
      "accent-soft": "#f0d9cf"
    },
    "dark": {
      "bg": "#181a1d",
      "title": "#b9cad6",
      "accent": "#df7a5c",
      "accent-soft": "#46281f"
    }
  },
  "plommon": {
    "name": "Plommon & havre",
    "desc": "Havrebeige med dämpad plommon och aubergine.",
    "light": {
      "bg": "#f3ede4",
      "title": "#4a2a3a",
      "accent": "#7a3e5b",
      "accent-soft": "#ecdbe3"
    },
    "dark": {
      "bg": "#1c1619",
      "title": "#ecd3df",
      "accent": "#c98aa9",
      "accent-soft": "#45283a"
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
export function getPalette() { const p = read(PALETTE_KEY); return PALETTES[p] ? p : 'terrakotta'; }

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
