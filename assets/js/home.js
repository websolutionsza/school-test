/* =====================================================================
   Greenwood High School — Homepage controller
   Loads latest published announcements + posts from PostBase and
   renders them as editorial cards. Preserves the existing data flow.
   ===================================================================== */

import { getClient } from "./postbase.js";
import { escapeHtml, formatDate } from "./utils.js";
import { renderMediaCard, attachLightboxTriggers } from "./media.js";

const ICONS = {
  calendar:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
  news:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6z"/></svg>',
  arrow:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>',
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

function renderLoading(grid) {
  grid.innerHTML =
    '<div class="state"><span class="spinner"></span> <span class="state-text">Loading…</span></div>';
}

async function fetchMediaFor(parentColumn, ids) {
  if (!ids || ids.length === 0) return {};
  const postbase = await getClient();
  const { data, error } = await postbase
    .from("media")
    .select("id, file_url, file_type, " + parentColumn)
    .in(parentColumn, ids);
  if (error) {
    console.error("Media fetch error:", error);
    return {};
  }
  const grouped = {};
  (data || []).forEach((m) => {
    const key = m[parentColumn];
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  });
  return grouped;
}

function cardHtml(item, opts) {
  const badge = opts.isAnnouncement
    ? '<span class="card-badge">Announcement</span>'
    : "";
  const icon = opts.isAnnouncement ? "" : '<div class="card-icon">' + ICONS.news + "</div>";
  const media = renderMediaCard(item._media || []);
  return (
    '<article class="card fade-in">' +
    icon +
    badge +
    '<h3 class="card-title">' + escapeHtml(item.title) + "</h3>" +
    '<p class="card-body">' + escapeHtml(item.content) + "</p>" +
    media +
    '<div class="card-meta">' +
    ICONS.calendar + " " + escapeHtml(formatDate(item.created_at)) +
    "</div>" +
    (opts.link
      ? '<a class="card-link" href="' + opts.link + '">Read more ' + ICONS.arrow + "</a>"
      : "") +
    "</article>"
  );
}

async function loadAnnouncements() {
  const grid = document.getElementById("announcementsGrid");
  if (!grid) return;
  renderLoading(grid);

  try {
    const postbase = await getClient();
    const { data, error } = await postbase
      .from("announcements")
      .select("id, title, content, created_at")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(6);

    if (error) throw error;
    if (!data || data.length === 0) {
      renderState(
        grid,
        ICONS.inbox,
        "No announcements yet",
        "Check back soon for the latest updates from the school office."
      );
      return;
    }

    const mediaByAnn = await fetchMediaFor(
      "announcement_id",
      data.map((a) => a.id)
    );
    data.forEach((a) => (a._media = mediaByAnn[a.id] || []));

    grid.innerHTML = data
      .map((a) => cardHtml(a, { isAnnouncement: true }))
      .join("");
    attachLightboxTriggers(grid);
  } catch (err) {
    console.error("Error loading announcements:", err);
    renderState(
      grid,
      ICONS.warning,
      "Could not load announcements",
      "Please try again in a moment."
    );
  }
}

async function loadPosts() {
  const grid = document.getElementById("postsGrid");
  if (!grid) return;
  renderLoading(grid);

  try {
    const postbase = await getClient();
    const { data, error } = await postbase
      .from("posts")
      .select("id, title, content, created_at")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(6);

    if (error) throw error;
    if (!data || data.length === 0) {
      renderState(
        grid,
        ICONS.inbox,
        "No posts yet",
        "School news and stories will appear here once published."
      );
      return;
    }

    const mediaByPost = await fetchMediaFor(
      "post_id",
      data.map((p) => p.id)
    );
    data.forEach((p) => (p._media = mediaByPost[p.id] || []));

    grid.innerHTML = data.map((p) => cardHtml(p, {})).join("");
    attachLightboxTriggers(grid);
  } catch (err) {
    console.error("Error loading posts:", err);
    renderState(
      grid,
      ICONS.warning,
      "Could not load posts",
      "Please try again in a moment."
    );
  }
}

export function initHome() {
  loadAnnouncements();
  loadPosts();
}
