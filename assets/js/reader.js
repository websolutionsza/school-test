/* =====================================================================
   Greenwood High School — Full-screen reading experience
   ---------------------------------------------------------------------
   Shared by the homepage and the announcements page. cards.js renders
   the preview cards; this module shows the complete content without
   navigating away or reloading the page:

   - openItemReader(item, opts)  → full announcement/post: hero image,
     badge, title, date, COMPLETE text, and every attachment with its
     existing View / Download actions plus a per-document Read More…
     that opens the document details view.
   - openDocumentReader(doc, parentTitle) → full-screen document
     details: type icon, file name, type, added date, parent item, and
     View / Download actions.
   - closeReader() → the X button or Escape. The page underneath is
     never reloaded; the visitor's previous scroll position is restored
     and focus returns to the button that opened the view.

   The view is a singleton DOM node created on first use (the same
   pattern as the image lightbox in media.js) and styled through
   assets/css/components.css (.reader …). The image lightbox sits on a
   higher z-index, so image previews still work inside the reader.
   ===================================================================== */

import { escapeHtml, formatDate, friendlyDocumentLabel } from "./utils.js";
import { renderMediaCard, attachLightboxTriggers, mediaIcon } from "./media.js";

const X_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
const CALENDAR_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>';

let readerEl = null;
let readerScrollEl = null;
let savedScrollY = 0;
let triggerEl = null; // element whose focus is restored on close
let currentItemTitle = ""; // parent title for document details views
/* Snapshot of the announcement/post view shown before a document
   details view, so closing the details returns the visitor to exactly
   where they were in that announcement (X = previous view). */
let returnView = null;

function ensureReader() {
  if (readerEl) return readerEl;

  readerEl = document.createElement("div");
  readerEl.className = "reader";
  readerEl.setAttribute("role", "dialog");
  readerEl.setAttribute("aria-modal", "true");
  readerEl.setAttribute("aria-label", "Reading view");
  readerEl.innerHTML =
    '<button type="button" class="reader-close" aria-label="Close reading view">' +
    X_ICON +
    "</button>" +
    '<div class="reader-scroll"><div class="reader-inner"></div></div>';
  document.body.appendChild(readerEl);
  readerScrollEl = readerEl.querySelector(".reader-scroll");

  readerEl.querySelector(".reader-close").addEventListener("click", closeReader);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && readerEl.classList.contains("is-open")) {
      closeReader();
    }
  });
  return readerEl;
}

/* Wire the per-document "Read More…" buttons rendered by
   renderMediaCard(…, { withDetails: true }). */
function wireDocDetails(media) {
  readerEl.querySelectorAll("[data-doc-details]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const url = btn.getAttribute("data-doc-details");
      const doc = (media || []).find((m) => m.file_url === url);
      if (doc) openDocumentReader(doc, currentItemTitle);
    });
  });
}

function open(html, media) {
  ensureReader();
  triggerEl = document.activeElement;
  savedScrollY = window.scrollY || 0;
  currentItemTitle = "";
  readerEl.querySelector(".reader-inner").innerHTML = html;
  readerEl.__readerMedia = media || []; // kept for the doc-details snapshot
  readerScrollEl.scrollTop = 0;
  readerEl.classList.add("is-open");
  document.body.classList.add("no-scroll");
  attachLightboxTriggers(readerEl);
  wireDocDetails(media || []);
  readerEl.querySelector(".reader-close").focus();
}

/**
 * Open the complete announcement/post in the full-screen reader.
 * @param {object} item - { title, content, created_at, media|_media }
 * @param {object} opts - { isAnnouncement: boolean }
 */
export function openItemReader(item, opts) {
  opts = opts || {};
  const isAnnouncement = opts.isAnnouncement !== false;
  const media = item._media || item.media || [];
  const firstImage = media.find((m) => m.file_type === "image") || null;
  const restMedia = firstImage ? media.filter((m) => m !== firstImage) : media;

  const hero = firstImage
    ? '<figure class="reader-hero"><img src="' +
      escapeHtml(firstImage.file_url) +
      '" alt="" /></figure>'
    : "";

  const attachmentsSection =
    restMedia.length > 0
      ? '<h2 class="reader-section-title">Attached files</h2>' +
        '<div class="reader-attachments">' +
        renderMediaCard(restMedia, { withDetails: true }) +
        "</div>"
      : "";

  open(
    '<div class="reader-article">' +
      hero +
      '<span class="badge badge-new">' +
      (isAnnouncement ? "Announcement" : "School news") +
      "</span>" +
      '<h1 class="reader-title">' +
      escapeHtml(item.title) +
      "</h1>" +
      '<div class="reader-meta">' +
      CALENDAR_ICON +
      escapeHtml(formatDate(item.created_at)) +
      "</div>" +
      '<div class="reader-content">' +
      escapeHtml(item.content) +
      "</div>" +
      attachmentsSection +
      "</div>",
    media
  );
  currentItemTitle = item.title || "";
  // An item view is always a top-level view: any doc-details snapshot
  // from a previous session is dropped here.
  returnView = null;
}

/**
 * Open the full-screen details view for one attached document.
 * Existing View / Download behaviour is preserved as real links.
 * @param {object} doc - { file_url, file_type, created_at? }
 */
export function openDocumentReader(doc, parentTitle) {
  // If the reader is currently showing an announcement/post, snapshot
  // it so the close button can bring the visitor back to it.
  if (readerEl && readerEl.classList.contains("is-open") && currentItemTitle) {
    returnView = {
      html: readerEl.querySelector(".reader-inner").innerHTML,
      media: readerEl.__readerMedia || [],
      scrollTop: readerScrollEl.scrollTop,
      title: currentItemTitle,
    };
  }

  const meta = friendlyDocumentLabel(doc.file_url);
  const rawName = (doc.file_url || "").split("?")[0].split("/").pop() || "file";
  let fileName = rawName;
  try {
    fileName = decodeURIComponent(rawName);
  } catch (e) {
    /* keep raw name if it contains stray percent sequences */
  }
  const added = doc.created_at ? formatDate(doc.created_at) : "";

  const facts =
    '<ul class="reader-doc-facts">' +
    '<li><strong>File:</strong> ' +
    escapeHtml(fileName) +
    "</li>" +
    '<li><strong>Type:</strong> ' +
    escapeHtml(meta.name) +
    " (" +
    escapeHtml(meta.type) +
    ")</li>" +
    (added
      ? "<li><strong>Added:</strong> " + escapeHtml(added) + "</li>"
      : "") +
    (parentTitle
      ? "<li><strong>Attached to:</strong> " + escapeHtml(parentTitle) + "</li>"
      : "") +
    "</ul>";

  open(
    '<div class="reader-article">' +
      '<div class="reader-doc-icon">' +
      mediaIcon(doc.file_type) +
      "</div>" +
      '<span class="badge badge-new">Document</span>' +
      '<h1 class="reader-title">' +
      escapeHtml(meta.name) +
      "</h1>" +
      '<div class="reader-meta">' +
      escapeHtml(meta.type) +
      " · " +
      escapeHtml(fileName) +
      "</div>" +
      '<div class="reader-doc-actions">' +
      '<a class="btn btn-primary" href="' +
      escapeHtml(doc.file_url) +
      '" target="_blank" rel="noopener">View file</a>' +
      '<a class="btn btn-secondary" href="' +
      escapeHtml(doc.file_url) +
      '" download target="_blank" rel="noopener">Download</a>' +
      "</div>" +
      facts +
      "</div>",
    [doc]
  );
}

/** Close the reader and restore the previous scroll position/focus.
    If the details view was opened from inside an announcement, the
    announcement view is restored instead of closing everything. */
export function closeReader() {
  if (!readerEl) return;

  if (returnView) {
    // Re-open the announcement/post view exactly where it was.
    const snapshot = returnView;
    returnView = null;
    currentItemTitle = snapshot.title || "";
    readerEl.querySelector(".reader-inner").innerHTML = snapshot.html;
    readerScrollEl.scrollTop = snapshot.scrollTop;
    attachLightboxTriggers(readerEl);
    wireDocDetails(snapshot.media);
    return;
  }

  readerEl.classList.remove("is-open");
  document.body.classList.remove("no-scroll");
  // The page underneath was never reloaded — put the visitor back
  // exactly where they were.
  window.scrollTo(0, savedScrollY);
  if (triggerEl && typeof triggerEl.focus === "function") {
    triggerEl.focus();
  }
  triggerEl = null;
}
