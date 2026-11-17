const STORAGE_KEY = 'theme';
const root = document.documentElement;
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

const systemTheme = () => (systemDark.matches ? 'dark' : 'light');
const activeTheme = () => root.dataset.theme ?? systemTheme();

function save(theme) {
  try {
    if (theme) localStorage.setItem(STORAGE_KEY, theme);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage is blocked. The choice still holds for this visit.
  }
}

/**
 * Wires up the light/dark button.
 *
 * The page follows the system setting until the visitor picks a side. Picking
 * the side the system already uses clears the override, so the page goes back
 * to following the system instead of pinning a theme forever.
 *
 * @param {HTMLButtonElement | null} button
 */
export function initThemeToggle(button) {
  // The stylesheet switches themes with light-dark(). Without it there is
  // only the light theme, so the button stays hidden.
  if (!button || !CSS.supports('color', 'light-dark(#000, #fff)')) return;

  const describe = () => {
    const next = activeTheme() === 'dark' ? 'light' : 'dark';
    button.setAttribute('aria-label', `Switch to ${next} theme`);
  };

  button.addEventListener('click', () => {
    const next = activeTheme() === 'dark' ? 'light' : 'dark';
    if (next === systemTheme()) {
      delete root.dataset.theme;
      save(null);
    } else {
      root.dataset.theme = next;
      save(next);
    }
    describe();
  });

  systemDark.addEventListener('change', describe);
  describe();
  button.hidden = false;
}
