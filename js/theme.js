// Ljust/mörkt läge. "system" följer telefonens inställning.
// Valet sparas i webbläsaren (localStorage) och läses redan i index.html så att sidan inte blinkar.

const KEY = 'receptbok-tema';
const COLORS = { light: '#f5efe4', dark: '#1c1714' };

export function getTheme() {
  try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; }
}

export function setTheme(theme) {
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch { /* lagring otillgänglig: gäller bara tills appen stängs */ }
  applyTheme(theme);
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  // Statusfältets färg i Android
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    const scheme = m.media.includes('dark') ? 'dark' : 'light';
    m.content = COLORS[theme === 'system' ? scheme : theme];
  });
}
