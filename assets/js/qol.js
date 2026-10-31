/* =====================================================================
   Greenwood High School — Quality-of-life features
   - Back-to-top button
   - Reading progress bar (only on long content)
   - Recently viewed pages (localStorage, public pages only)
   - Keyboard shortcuts (? for help, g then h/a/n/c for nav, t theme)
   - Share menu (Web Share API + copy-link fallback)
   - Copy buttons (data-copy attribute → clipboard)
   ===================================================================== */

import {
  $,
  $all,
  copyToClipboard,
  sharePage,
  canonicalUrl,
  throttle,
  showToast,
} from "./utils.js";

/* ---- Back to top ------------------------------------------------ */
function initBackToTop() {
  const btn = document.querySelector(".back-to-top");
  if (!btn) return;

  const onScroll = throttle(() => {
    const shouldShow = window.scrollY > 600;
    btn.classList.toggle("is-visible", shouldShow);
  }, 120);

  window.addEventListener("scroll", onScroll, { passive: true });

  btn.addEventListener("click", () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  });

  onScroll();
}

/* ---- Reading progress ------------------------------------------- */
function initReadingProgress() {
  const bar = document.querySelector(".reading-progress");
  if (!bar) return;

  // Only show on pages with substantial content
  const bodyHeight = document.body.scrollHeight - window.innerHeight;
  if (bodyHeight < 800) return;

  const onScroll = throttle(() => {
    const scrolled = window.scrollY;
    const max = document.body.scrollHeight - window.innerHeight;
    if (max <= 0) return;
    const pct = Math.min(100, Math.max(0, (scrolled / max) * 100));
    bar.style.width = pct.toFixed(2) + "%";
    bar.classList.toggle("is-visible", scrolled > 120);
  }, 80);

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  onScroll();
}

/* ---- Recently viewed pages -------------------------------------- */
const RECENT_KEY = "ghs:recent-pages";
const RECENT_MAX = 6;
// Routes that should never be tracked
const PRIVATE_PATTERNS = [
  /^\/admin/,
  /^\/administration/,
  /^\/admin-login/,
];

function isPrivatePath(path) {
  return PRIVATE_PATTERNS.some((re) => re.test(path));
}

function readRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeRecent(items) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, RECENT_MAX)));
  } catch (e) {
    /* ignore */
  }
}

export function recordCurrentPage() {
  const path = window.location.pathname;
  if (isPrivatePath(path)) return;
  // Only track HTML pages (skip assets, api, etc.)
  if (!path.endsWith(".html") && path !== "/" && !path.endsWith("/")) return;

  const title = document.title.replace(/\s*\|\s*Greenwood.*$/i, "").trim();
  if (!title) return;

  const entry = { path: path, title: title, t: Date.now() };
  const existing = readRecent().filter((e) => e.path !== path);
  const next = [entry, ...existing].slice(0, RECENT_MAX);
  writeRecent(next);
}

export function renderRecentPages(targetSelector) {
  const target = document.querySelector(targetSelector);
  if (!target) return;

  const items = readRecent();
  // Drop the current page from the list
  const currentPath = window.location.pathname;
  const filtered = items.filter((e) => e.path !== currentPath);

  if (filtered.length === 0) {
    target.innerHTML =
      '<p class="empty">Pages you visit on this site will appear here for quick access.</p>';
    return;
  }

  const ul = document.createElement("ul");
  filtered.forEach((item) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = item.path;
    a.textContent = item.title;
    li.appendChild(a);
    ul.appendChild(li);
  });
  target.innerHTML = "";
  target.appendChild(ul);
}

function initRecentlyViewed() {
  recordCurrentPage();
  // Render into any [data-recent-pages] containers on the page
  const targets = $all("[data-recent-pages]");
  targets.forEach((t) => renderRecentPages("#" + t.id || t));
}

/* ---- Keyboard shortcuts ----------------------------------------- */
const SHORTCUTS = [
  { keys: ["g", "h"], desc: "Go to Home", action: () => navigate("index.html") },
  { keys: ["g", "a"], desc: "Go to About", action: () => navigate("about.html") },
  { keys: ["g", "n"], desc: "Go to Announcements", action: () => navigate("announcement.html") },
  { keys: ["g", "c"], desc: "Go to Contact", action: () => navigate("contacts.html") },
  { keys: ["?"], desc: "Show this keyboard shortcuts dialog", action: () => openShortcutsDialog() },
  { keys: ["Esc"], desc: "Close dialogs / menus", action: () => closeEverything() },
];

let gKeyBuffer = null;
let gKeyTimer = null;

function navigate(href) {
  window.location.href = href;
}

function isTyping() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || el.isContentEditable;
}

function openShortcutsDialog() {
  let dialog = document.querySelector(".shortcuts-dialog");
  if (!dialog) {
    dialog = buildShortcutsDialog();
    document.body.appendChild(dialog);
  }
  dialog.classList.add("is-open");
  const closeBtn = dialog.querySelector(".shortcuts-close .btn");
  if (closeBtn) closeBtn.focus();
}

function closeEverything() {
  document.querySelectorAll(".shortcuts-dialog.is-open").forEach((d) => d.classList.remove("is-open"));
  document.querySelectorAll(".share-menu.is-open").forEach((m) => m.classList.remove("is-open"));
  document.querySelectorAll(".nav-primary.is-open").forEach((n) => n.classList.remove("is-open"));
}

function buildShortcutsDialog() {
  const dl = document.createElement("div");
  dl.className = "shortcuts-dialog";
  dl.setAttribute("role", "dialog");
  dl.setAttribute("aria-modal", "true");
  dl.setAttribute("aria-label", "Keyboard shortcuts");

  const items = SHORTCUTS.map((s) => {
    const keys = s.keys
      .map((k) => `<span class="kbd">${k === "Esc" ? "Esc" : k}</span>`)
      .join('<span class="sep">then</span>');
    return `<li><span class="shortcut-desc">${s.desc}</span><span class="shortcut-keys">${keys}</span></li>`;
  }).join("");

  dl.innerHTML = `
    <div class="shortcuts-card">
      <h2>Keyboard shortcuts</h2>
      <p>Available on every public page. Press <span class="kbd">Esc</span> to close this dialog.</p>
      <ul class="shortcuts-list">${items}</ul>
      <div class="shortcuts-close"><button type="button" class="btn btn-secondary btn-sm">Close</button></div>
    </div>
  `;

  dl.addEventListener("click", (e) => {
    if (e.target === dl || e.target.closest(".shortcuts-close .btn")) {
      dl.classList.remove("is-open");
    }
  });

  return dl;
}

function initKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return; // never override browser shortcuts
    if (e.key === "Escape") {
      closeEverything();
      return;
    }
    if (isTyping()) return;

    const key = e.key.toLowerCase();

    // Two-key sequence: g then h/a/n/c
    if (key === "g") {
      gKeyBuffer = "g";
      clearTimeout(gKeyTimer);
      gKeyTimer = setTimeout(() => { gKeyBuffer = null; }, 800);
      return;
    }
    if (gKeyBuffer === "g") {
      const match = SHORTCUTS.find((s) => s.keys.length === 2 && s.keys[0] === "g" && s.keys[1] === key);
      if (match) {
        e.preventDefault();
        gKeyBuffer = null;
        clearTimeout(gKeyTimer);
        match.action();
        return;
      }
      gKeyBuffer = null;
    }

    // Single-key shortcuts
    const single = SHORTCUTS.find((s) => s.keys.length === 1 && s.keys[0] === key);
    if (single) {
      e.preventDefault();
      single.action();
    }
  });

  // Add a small shortcuts trigger to nav-actions if present
  const navActions = document.querySelector(".nav-actions");
  if (navActions && !document.querySelector(".shortcuts-trigger")) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "shortcuts-trigger";
    btn.setAttribute("aria-label", "Show keyboard shortcuts");
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"/></svg><span class="kbd">?</span>`;
    btn.addEventListener("click", openShortcutsDialog);
    navActions.appendChild(btn);
  }
}

/* ---- Share menu ------------------------------------------------- */
function initShareMenus() {
  const menus = $all(".share-menu");
  if (menus.length === 0) return;

  menus.forEach((menu) => {
    const trigger = menu.querySelector(".share-trigger");
    const panel = menu.querySelector(".share-panel");
    if (!trigger || !panel) return;

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.contains("is-open");
      // Close all other menus
      $all(".share-menu.is-open").forEach((m) => {
        if (m !== menu) m.classList.remove("is-open");
      });
      menu.classList.toggle("is-open", !isOpen);
    });

    const nativeBtn = panel.querySelector("[data-share-native]");
    const copyBtn = panel.querySelector("[data-share-copy]");

    if (nativeBtn) {
      nativeBtn.addEventListener("click", async () => {
        const url = canonicalUrl();
        const title = document.title;
        const result = await sharePage({ title, text: title, url });
        if (result === "copied") {
          showToast("Link copied to clipboard", "success");
        } else if (result === "shared") {
          showToast("Shared successfully", "success");
        } else if (result === "failed") {
          showToast("Could not share or copy", "error");
        }
        menu.classList.remove("is-open");
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        const url = canonicalUrl();
        const ok = await copyToClipboard(url);
        if (ok) {
          showToast("Link copied to clipboard", "success");
          copyBtn.classList.add("is-copied");
          setTimeout(() => copyBtn.classList.remove("is-copied"), 1500);
        } else {
          showToast("Could not copy link", "error");
        }
        menu.classList.remove("is-open");
      });
    }
  });

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".share-menu")) {
      $all(".share-menu.is-open").forEach((m) => m.classList.remove("is-open"));
    }
  });
}

/* ---- Generic [data-copy] buttons -------------------------------- */
function initCopyButtons() {
  $all("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy") || btn.dataset.copyText || "";
      if (!text) return;
      const ok = await copyToClipboard(text);
      if (ok) {
        showToast("Copied to clipboard", "success");
        btn.classList.add("is-copied");
        setTimeout(() => btn.classList.remove("is-copied"), 1500);
      } else {
        showToast("Could not copy", "error");
      }
    });
  });
}

/* ---- Master initialiser ----------------------------------------- */
export function initQualityOfLife() {
  initBackToTop();
  initReadingProgress();
  initRecentlyViewed();
  initKeyboardShortcuts();
  initShareMenus();
  initCopyButtons();
}
