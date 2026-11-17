/* =====================================================================
   Greenwood High School — Announcements page controller
   Renders all published announcements in an editorial list with
   clear dates, titles, and summaries. Rendering is unchanged from the
   original PostBase version; only the data source differs.
   ===================================================================== */

import { apiGet } from "./api.js";
import { escapeHtml, formatDateParts } from "./utils.js";
import { attachLightboxTriggers } from "./media.js";

const ICONS = {
  folder:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
  warning:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
  inbox:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>',
};

function renderState(grid, icon, title, text) {
  grid.innerHTML =
    '<div class="state">' +
    '<div class="state-icon">' + icon + "</div>" +
    '<div class="state-title">' + escapeHtml(title) + "</div>" +
    '<p class="state-text">' + escapeHtml(text) + "</p>" +
    "</div>";
}

function renderAnnouncementCard(item, media) {
  const parts = formatDateParts(item.created_at);
  const dateBlock = parts
    ? '<div class="editorial-date">' +
      '<div class="day">' + parts.day + "</div>" +
      '<div class="month">' + parts.month + "</div>" +
      '<div class="year">' + parts.year + "</div>" +
      "</div>"
    : "";

  const mediaCount = (media || []).length;

  return (
    '<article class="editorial-item fade-in">' +
    dateBlock +
    '<div class="editorial-body">' +
    '<h3>' + escapeHtml(item.title) + "</h3>" +
    '<p>' + escapeHtml(item.content) + "</p>" +
    (mediaCount > 0
      ? '<div class="editorial-actions">' +
        '<span class="badge">' + ICONS.folder + " " + mediaCount + " file" + (mediaCount === 1 ? "" : "s") + "</span>" +
        "</div>"
      : "") +
    "</div>" +
    "</article>"
  );
}

async function loadAnnouncements() {
  const container = document.getElementById("announcementsContainer");
  if (!container) return;
  container.innerHTML =
    '<div class="state"><span class="spinner"></span> <span class="state-text">Loading announcements…</span></div>';

  try {
    const data = await apiGet("/api/public/announcements");
    const items = (data && data.announcements) || [];

    if (items.length === 0) {
      renderState(
        container,
        ICONS.inbox,
        "No announcements yet",
        "Updates from the school office will appear here. Please check back soon."
      );
      return;
    }

    container.innerHTML = items
      .map((item) => renderAnnouncementCard(item, item.media || []))
      .join("");
    attachLightboxTriggers(container);
  } catch (err) {
    console.error("Error loading announcements:", err);
    renderState(
      container,
      ICONS.warning,
      "Could not load announcements",
      "Please refresh the page to try again."
    );
  }
}

export function initAnnouncementsPage() {
  loadAnnouncements();
}
