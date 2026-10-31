/* =====================================================================
   Greenwood High School — Theme (light/dark) controller
   ---------------------------------------------------------------------
   - Reads saved preference from localStorage.
   - Falls back to OS prefers-color-scheme on first visit.
   - Applies [data-theme="..."] on <html> BEFORE first paint to avoid
     FOUC. (The inline script in <head> handles this — see HTML files.)
   - Toggles the theme when the .theme-toggle button is clicked.
   - Syncs across tabs via the storage event.
   ===================================================================== */

const THEME_KEY = "ghs:theme";

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch (e) {
    return null;
  }
}

function storeTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (e) {
    /* ignore */
  }
}

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function currentTheme() {
  const stored = getStoredTheme();
  if (stored === "light" || stored === "dark") return stored;
  return systemPrefersDark() ? "dark" : "light";
}

export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  // Update toggle button aria-label
  document.querySelectorAll(".theme-toggle").forEach((btn) => {
    btn.setAttribute(
      "aria-label",
      theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
    );
    btn.setAttribute(
      "title",
      theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
    );
  });
}

export function setTheme(theme) {
  applyTheme(theme);
  storeTheme(theme);
}

export function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  setTheme(next);
}

/* Initialise on public pages (the inline script in <head> does the
   first paint; this just wires up the toggle button and tab sync). */
export function initThemeToggle() {
  applyTheme(currentTheme());

  document.querySelectorAll(".theme-toggle").forEach((btn) => {
    btn.addEventListener("click", toggleTheme);
  });

  // Sync across tabs
  window.addEventListener("storage", (e) => {
    if (e.key === THEME_KEY && (e.newValue === "light" || e.newValue === "dark")) {
      applyTheme(e.newValue);
    }
  });

  // If user has no explicit preference, follow system changes
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener?.("change", () => {
    if (!getStoredTheme()) {
      applyTheme(systemPrefersDark() ? "dark" : "light");
    }
  });
}
