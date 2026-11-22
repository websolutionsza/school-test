/* =====================================================================
   Greenwood High School — Announcement & post card component
   ---------------------------------------------------------------------
   ONE shared implementation used by BOTH the homepage (home.js) and
   the dedicated Announcements page (announcements.js), so presentation
   and behaviour are identical wherever an item appears — no duplicate
   rendering systems, same data, same reader.

   Content-driven card layout (spec-compliant):
     1. Image at the top, ONLY if one exists (no placeholder, no
        reserved space, no oversized fallback graphics).
     2. Title underneath the image.
     3. The complete message when it is short; a cleanly-truncated
        preview (word-boundary safe, ellipsis) when it is long.
     4. Read More… ONLY when the message was actually shortened.
     5. A compact "N attached files" chip (clickable — opens the
        reader, where per-file View / Download / details live).
     6. Date, when available, as the closing line.
   Cards size naturally: the grid does not stretch shorter cards to
   match taller ones (see .card-grid { align-items: start } in
   components.css).
   ===================================================================== */

import { escapeHtml, formatDate, truncatePreview } from "./utils.js";
import { renderAttachmentSummary, attachLightboxTriggers } from "./media.js";
import { openItemReader } from "./reader.js";

const PREVIEW_CHARS = 200;

const ICONS = {
  calendar:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
  arrow:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>',
};

function heroHtml(media) {
  const firstImage = (media || []).find((m) => m.file_type === "image");
  if (!firstImage) return ""; // compact text-only card — no reserved space
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

function metaHtml(item) {
  if (!item.created_at) return ""; // no date available — no empty line
  return (
    '<div class="card-meta">' +
    ICONS.calendar +
    " " +
    escapeHtml(formatDate(item.created_at)) +
    "</div>"
  );
}

function cardHtml(item, index, opts) {
  const isAnnouncement = opts.isAnnouncement !== false;
  const badge = isAnnouncement
    ? '<span class="card-badge">Announcement</span>'
    : "";

  const content = String(item.content || "");
  const isTruncated = content.length > PREVIEW_CHARS;
  const preview = isTruncated ? truncatePreview(content, PREVIEW_CHARS) : content;

  // Read More appears ONLY when the message was actually shortened.
  const readMore = isTruncated
    ? '<button type="button" class="readmore-btn" data-reader-index="' +
      index +
      '">Read More… ' +
      ICONS.arrow +
      "</button>"
    : "";

  return (
    '<article class="card announcement-card fade-in">' +
    heroHtml(item._media || []) +
    badge +
    '<h3 class="card-title">' +
    escapeHtml(item.title) +
    "</h3>" +
    '<p class="card-body">' +
    escapeHtml(preview) +
    "</p>" +
    readMore +
    renderAttachmentSummary(item._media || [], index) +
    metaHtml(item) +
    "</article>"
  );
}

/**
 * Render the cards into a container and wire up the Read More buttons,
 * the attachment-summary chips (both open the full-screen reader) and
 * the image lightbox triggers.
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

  container.querySelectorAll(".attach-summary").forEach((chip) => {
    chip.addEventListener("click", () => {
      const item = items[Number(chip.getAttribute("data-attach-index"))];
      if (item) openItemReader(item, opts);
    });
  });

  attachLightboxTriggers(container);
}
