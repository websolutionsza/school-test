/* =====================================================================
   Greenwood High School — Shared utilities
   Escape, date formatting, toasts, clipboard, share, DOM helpers.
   No business logic; pure functions only.
   ===================================================================== */

/* ---- HTML escaping (XSS prevention) ----------------------------- */
export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
}

/* ---- Date formatting -------------------------------------------- */
export function formatDate(iso, opts) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(
    "en-ZA",
    opts || { year: "numeric", month: "long", day: "numeric" }
  );
}

export function formatDateParts(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return {
    day: d.getDate(),
    month: d.toLocaleDateString("en-ZA", { month: "short" }),
    year: d.getFullYear(),
  };
}

export function relativeTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < hour) return Math.max(1, Math.round(diff / minute)) + "m ago";
  if (diff < day) return Math.round(diff / hour) + "h ago";
  if (diff < 7 * day) return Math.round(diff / day) + "d ago";
  return formatDate(iso);
}

/* ---- DOM helpers ------------------------------------------------ */
export function $(selector, root) {
  return (root || document).querySelector(selector);
}
export function $all(selector, root) {
  return Array.from((root || document).querySelectorAll(selector));
}

/* ---- Toasts ----------------------------------------------------- */
let toastRegion = null;
function ensureToastRegion() {
  if (toastRegion) return toastRegion;
  toastRegion = document.querySelector(".toast-region");
  if (!toastRegion) {
    toastRegion = document.createElement("div");
    toastRegion.className = "toast-region";
    toastRegion.setAttribute("role", "status");
    toastRegion.setAttribute("aria-live", "polite");
    document.body.appendChild(toastRegion);
  }
  return toastRegion;
}

const TOAST_ICONS = {
  success:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
  error:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
  info:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
};

export function showToast(message, type = "info", duration = 3500) {
  const region = ensureToastRegion();
  const el = document.createElement("div");
  el.className = "toast is-" + type;
  const icon = TOAST_ICONS[type] || TOAST_ICONS.info;
  el.innerHTML = icon + "<span>" + escapeHtml(message) + "</span>";
  region.appendChild(el);
  setTimeout(() => {
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), 220);
  }, duration);
}

/* ---- Clipboard -------------------------------------------------- */
export async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      /* fall through to fallback */
    }
  }
  // Fallback for older browsers / non-secure contexts
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

/* ---- Web Share API ---------------------------------------------- */
export async function sharePage(opts) {
  const { title, text, url } = opts;
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (err) {
      if (err && err.name === "AbortError") return "aborted";
      // fall through to clipboard
    }
  }
  const ok = await copyToClipboard(url);
  return ok ? "copied" : "failed";
}

/* ---- Friendly document label from URL --------------------------- */
export function friendlyDocumentLabel(url) {
  const raw = (url || "").split("?")[0];
  const file = raw.split("/").pop() || "";
  const dot = file.lastIndexOf(".");
  const ext = dot > -1 ? file.slice(dot + 1).toLowerCase() : "";
  switch (ext) {
    case "pdf": return { name: "PDF Document", type: "PDF" };
    case "doc":
    case "docx": return { name: "Word Document", type: "DOCX" };
    case "xls":
    case "xlsx": return { name: "Excel Spreadsheet", type: "XLSX" };
    case "ppt":
    case "pptx": return { name: "PowerPoint Presentation", type: "PPTX" };
    case "zip": return { name: "ZIP Archive", type: "ZIP" };
    case "txt": return { name: "Text Document", type: "TXT" };
    case "csv": return { name: "CSV File", type: "CSV" };
    case "rtf": return { name: "Rich Text Document", type: "RTF" };
    case "odt": return { name: "OpenDocument Text", type: "ODT" };
    case "ods": return { name: "OpenDocument Spreadsheet", type: "ODS" };
    case "odp": return { name: "OpenDocument Presentation", type: "ODP" };
    default: return { name: "Attached Document", type: "FILE" };
  }
}

/* ---- Debounce --------------------------------------------------- */
export function debounce(fn, wait = 200) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/* ---- Throttle (for scroll listeners) ---------------------------- */
export function throttle(fn, wait = 100) {
  let last = 0;
  let timer = null;
  return function (...args) {
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      if (timer) { clearTimeout(timer); timer = null; }
      last = now;
      fn.apply(this, args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn.apply(this, args);
      }, remaining);
    }
  };
}

/* ---- Page metadata ---------------------------------------------- */
export function canonicalUrl() {
  if (document.querySelector('link[rel="canonical"]')) {
    return document.querySelector('link[rel="canonical"]').href;
  }
  return window.location.href.split("#")[0];
}
