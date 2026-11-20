/* =====================================================================
   Greenwood High School — Announcement & post card component
   ---------------------------------------------------------------------
   ONE shared implementation used by BOTH the homepage (home.js) and
   the dedicated Announcements page (announcements.js), so presentation
   and behaviour are identical wherever an item appears — no duplicate
   rendering systems, same data, same reader.

   Card structure (spec-compliant):
     1. Announcement image at the top (edge-to-edge hero; omitted
        cleanly when the item has no image).
     2. Title underneath the image.
     3. A short, cleanly-truncated text preview (word-boundary safe,
        ellipsis when shortened) — the full text is NEVER dumped into
        the homepage card.
     4. A compact "N attached files" summary chip instead of inline
        document rows (details live in the reader).
     5. Date, then a "Read More…" button that opens the full-screen
        reading experience (reader.js).
   ===================================================================== */

import { escapeHtml, formatDate, truncatePreview } from "./utils.js";
import { renderAttachmentSummary, attachLightboxTriggers } from "./media.js";
import { openItemReader } from "./reader.js";

const PREVIEW_CHARS = 200;

const ICONS = {
  calendar:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
  news:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6z"/></svg>',
  arrow:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>',
};

function heroHtml(media) {
  const firstImage = (media || []).find((m) => m.file_type === "image");
  if (!firstImage) return ""; // clean no-image layout, card stays intact
  const safeUrl = escapeHtml(firstImage.file_url);
  return (
    '<div class="card-hero">' +
    '<img src="' +
    safeUrl +
    '" alt="" loading="lazy" data-lightbox="' +
    safeUrl +
    '" />' +
    "</div>"
  );
}

function cardHtml(item, index, opts) {
  const isAnnouncement = opts.isAnnouncement !== false;
  const badge = isAnnouncement
    ? '<span class="card-badge">Announcement</span>'
    : '<div class="card-icon">' + ICONS.news + "</div>";

  return (
    '<article class="card announcement-card fade-in">' +
    heroHtml(item._media || []) +
    badge +
    '<h3 class="card-title">' +
    escapeHtml(item.title) +
    "</h3>" +
    '<p class="card-body">' +
    escapeHtml(truncatePreview(item.content, PREVIEW_CHARS)) +
    "</p>" +
    renderAttachmentSummary(item._media || []) +
    '<div class="card-meta">' +
    ICONS.calendar +
    " " +
    escapeHtml(formatDate(item.created_at)) +
    "</div>" +
    '<button type="button" class="readmore-btn" data-reader-index="' +
    index +
    '">Read More… ' +
    ICONS.arrow +
    "</button>" +
    "</article>"
  );
}

/**
 * Render the cards into a container and wire up the Read More buttons
 * and image lightbox triggers.
 * @param {HTMLElement} container
 * @param {Array<object>} items - each with { title, content, created_at, _media }
 * @param {object} opts - { isAnnouncement: boolean }
 */
export function renderCards(container, items, opts) {
  container.innerHTML = items
    .map((item, index) => cardHtml(item, index, opts))
    .join("");

  container.querySelectorAll("[data-reader-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = items[Number(btn.getAttribute("data-reader-index"))];
      if (item) openItemReader(item, opts);
    });
  });

  attachLightboxTriggers(container);
}
