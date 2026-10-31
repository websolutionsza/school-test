/* =====================================================================
   Greenwood High School — Media rendering & lightbox
   Shared between the homepage and announcements page.
   Renders images, PDFs, and document attachments consistently.
   ===================================================================== */

import { escapeHtml, friendlyDocumentLabel } from "./utils.js";

const ICONS = {
  pdf:
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  doc:
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>',
  file:
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
};

function iconForType(type) {
  if (type === "pdf") return ICONS.pdf;
  if (type === "document") return ICONS.doc;
  return ICONS.file;
}

/**
 * Renders the media block for a card (images + attachments).
 * @param {Array<{file_url:string, file_type:string}>} media
 * @param {object} opts - { openLightbox: function(url) }
 * @returns {string} HTML
 */
export function renderMediaCard(media, opts) {
  opts = opts || {};
  if (!media || media.length === 0) return "";

  const images = media.filter((m) => m.file_type === "image");
  const pdfs = media.filter((m) => m.file_type === "pdf");
  const docs = media.filter((m) => m.file_type === "document");

  let html = "";

  if (images.length > 0) {
    let cls = "card-media";
    if (images.length === 1) cls += " is-single";
    else if (images.length === 2) cls += " is-pair";

    const items = images
      .map((m) => {
        const safeUrl = escapeHtml(m.file_url);
        // Note: lightbox trigger is wired up by attachLightboxTriggers()
        // after innerHTML is set. We mark with data-lightbox.
        return (
          '<img src="' +
          safeUrl +
          '" alt="" loading="lazy" data-lightbox="' +
          safeUrl +
          '" />'
        );
      })
      .join("");
    html += '<div class="' + cls + '">' + items + "</div>";
  }

  if (pdfs.length > 0) {
    html += '<div class="attachments">';
    pdfs.forEach((m) => {
      const meta = friendlyDocumentLabel(m.file_url);
      html +=
        '<div class="attachment">' +
        '<span class="attach-icon">' + ICONS.pdf + "</span>" +
        '<div class="attach-body">' +
        '<div class="attach-name">' + escapeHtml(meta.name) + "</div>" +
        '<div class="attach-type">' + escapeHtml(meta.type) + "</div>" +
        "</div>" +
        '<div class="attach-actions">' +
        '<a class="attach-btn view" href="' + escapeHtml(m.file_url) + '" target="_blank" rel="noopener">View</a>' +
        '<a class="attach-btn download" href="' + escapeHtml(m.file_url) + '" download target="_blank" rel="noopener">Download</a>' +
        "</div>" +
        "</div>";
    });
    html += "</div>";
  }

  if (docs.length > 0) {
    html += '<div class="attachments">';
    docs.forEach((m) => {
      const meta = friendlyDocumentLabel(m.file_url);
      html +=
        '<div class="attachment">' +
        '<span class="attach-icon">' + iconForType("document") + "</span>" +
        '<div class="attach-body">' +
        '<div class="attach-name">' + escapeHtml(meta.name) + "</div>" +
        '<div class="attach-type">' + escapeHtml(meta.type) + "</div>" +
        "</div>" +
        '<div class="attach-actions">' +
        '<a class="attach-btn download" href="' + escapeHtml(m.file_url) + '" download target="_blank" rel="noopener">Download</a>' +
        "</div>" +
        "</div>";
    });
    html += "</div>";
  }

  return html;
}

/* ---- Lightbox --------------------------------------------------- */
let lightboxEl = null;
let lightboxImg = null;

function ensureLightbox() {
  if (lightboxEl) return lightboxEl;
  lightboxEl = document.createElement("div");
  lightboxEl.className = "lightbox";
  lightboxEl.setAttribute("role", "dialog");
  lightboxEl.setAttribute("aria-modal", "true");
  lightboxEl.setAttribute("aria-label", "Image preview");
  lightboxEl.innerHTML =
    '<button type="button" class="lightbox-close" aria-label="Close image preview">' +
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
    "</button>" +
    '<img alt="" />';
  document.body.appendChild(lightboxEl);
  lightboxImg = lightboxEl.querySelector("img");

  lightboxEl.addEventListener("click", (e) => {
    if (e.target === lightboxEl || e.target.closest(".lightbox-close")) {
      closeLightbox();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && lightboxEl.classList.contains("is-open")) {
      closeLightbox();
    }
  });
  return lightboxEl;
}

export function openLightbox(url) {
  ensureLightbox();
  lightboxImg.src = url;
  lightboxEl.classList.add("is-open");
  document.body.classList.add("no-scroll");
  const closeBtn = lightboxEl.querySelector(".lightbox-close");
  if (closeBtn) closeBtn.focus();
}

export function closeLightbox() {
  if (!lightboxEl) return;
  lightboxEl.classList.remove("is-open");
  lightboxImg.src = "";
  document.body.classList.remove("no-scroll");
}

/**
 * Wire up all [data-lightbox] triggers inside a given root element.
 */
export function attachLightboxTriggers(root) {
  const rootEl = root || document;
  rootEl.querySelectorAll("[data-lightbox]").forEach((img) => {
    if (img.__lightboxWired) return;
    img.__lightboxWired = true;
    img.style.cursor = "zoom-in";
    img.addEventListener("click", () => {
      openLightbox(img.getAttribute("data-lightbox"));
    });
  });
}
