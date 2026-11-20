/* =====================================================================
   Greenwood High School — Announcements page controller
   Renders all published announcements using the SAME shared card
   component as the homepage (cards.js), so a visitor gets an identical
   card and full-screen reading experience whether they open an
   announcement here or from the homepage. No separate data source, no
   duplicate announcement system — same /api/public/announcements data.
   ===================================================================== */

import { apiGet } from "./api.js";
import { escapeHtml } from "./utils.js";
import { renderCards } from "./cards.js";

const ICONS = {
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

    // Same card design as the homepage — switch the editorial list to
    // the shared card grid and render through cards.js.
    container.classList.remove("editorial-list");
    container.classList.add("card-grid");
    items.forEach((a) => (a._media = a.media || []));
    renderCards(container, items, { isAnnouncement: true });
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
