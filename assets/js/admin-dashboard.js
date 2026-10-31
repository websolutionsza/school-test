/* =====================================================================
   Greenwood High School — Admin dashboard
   ---------------------------------------------------------------------
   Preserves ALL existing functionality:
   - Session validation (per-tab flag + PostBase session)
   - Stats cards (announcements / posts / media)
   - Tabs: announcements, posts
   - Create / edit / delete with file attachments
   - File upload via /api/upload (server-side PostFile proxy)
   - Existing media + pending media management
   - Draft recovery (localStorage)
   - Inactivity countdown modal
   - Toasts

   Changes vs. original:
   - Uses shared postbase.js client (config from /api/config, no keys in JS)
   - Uses shared utils.js for escapeHtml, formatDate, showToast, debounce
   - Code split into smaller named functions for maintainability
   ===================================================================== */

import { getClient } from "./postbase.js";
import { $, $all, escapeHtml, formatDate, showToast, debounce } from "./utils.js";

const UPLOAD_PROXY_URL = "/api/upload";
const MAX_FILES = 10;
const IDLE_MS = 60 * 1000;
const COUNTDOWN_SECONDS = 20;
const SESSION_FLAG = "admin_tab_authenticated";

const DRAFT_KEYS = {
  announcement: "ghs_draft_announcement",
  post: "ghs_draft_post",
};

let currentUser = null;
let announcementsCache = [];
let postsCache = [];

const formState = {
  announcement: { existing: [], removed: [], pending: [] },
  post: { existing: [], removed: [], pending: [] },
};

const ICONS = {
  image:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
  pdf:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  doc:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>',
  file:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  close:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
  calendar:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
  folder:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
  edit:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
  trash:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
  warning:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
  inbox:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>',
  spinner:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>',
};

/* ---- File type detection (unchanged logic) ---------------------- */
function getFileTypeFromMime(mimeType, filename) {
  const mime = (mimeType || "").toLowerCase();
  const name = (filename || "").toLowerCase();

  if (mime.startsWith("video/")) return null;
  if (mime.startsWith("audio/")) return null;
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";

  const docExtensions = [
    ".doc",".docx",".xls",".xlsx",".ppt",".pptx",
    ".txt",".csv",".rtf",".odt",".ods",".odp",".zip",
  ];
  const docMimes = [
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
    "application/rtf",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.oasis.opendocument.spreadsheet",
    "application/vnd.oasis.opendocument.presentation",
    "application/zip",
    "application/x-zip-compressed",
  ];
  if (docMimes.includes(mime)) return "document";
  if (docExtensions.some((ext) => name.endsWith(ext))) return "document";
  return null;
}

function getFileIcon(type) {
  if (type === "image") return ICONS.image;
  if (type === "pdf") return ICONS.pdf;
  if (type === "document") return ICONS.doc;
  return ICONS.file;
}

/* ---- Auth ------------------------------------------------------- */
async function requireAuth() {
  const tabAuthed = sessionStorage.getItem(SESSION_FLAG) === "true";
  if (!tabAuthed) {
    window.location.replace("admin-login.html");
    return false;
  }
  try {
    const postbase = await getClient();
    const { data, error } = await postbase.auth.getSession();
    if (error) throw error;
    if (!data || !data.session) {
      sessionStorage.removeItem(SESSION_FLAG);
      window.location.replace("admin-login.html");
      return false;
    }
    currentUser = data.session.user;
    $("#userName").textContent = currentUser.name || "Administrator";
    $("#userEmail").textContent = currentUser.email || "";
    return true;
  } catch (err) {
    console.error("Auth check failed:", err);
    // Defensive: if the backend is unreachable (expired hosting,
    // network failure, etc.) show a maintenance screen instead of
    // redirecting to login (which would also fail and loop).
    const msg = (err && err.message ? err.message : "").toLowerCase();
    if (
      msg.includes("failed to fetch") ||
      msg.includes("networkerror") ||
      msg.includes("config endpoint") ||
      msg.includes("load failed")
    ) {
      showDashboardMaintenance();
      return false;
    }
    sessionStorage.removeItem(SESSION_FLAG);
    window.location.replace("admin-login.html");
    return false;
  }
}

/* ---- Defensive: show maintenance mode if backend is down -------- */
function showDashboardMaintenance() {
  const overlay = $("#loadingOverlay");
  if (overlay) {
    overlay.innerHTML =
      '<div style="text-align:center; max-width: 480px; padding: var(--space-6);">' +
      '<div style="width: 56px; height: 56px; margin: 0 auto var(--space-5); ' +
      'border-radius: 50%; background: var(--color-accent-soft); ' +
      'color: var(--color-accent-hover); display: flex; align-items: center; justify-content: center;">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>' +
      '<line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div>' +
      '<h2 style="font-family: var(--font-display); font-size: var(--fs-lg); margin-bottom: var(--space-3);">System offline for maintenance</h2>' +
      '<p style="color: var(--color-text-muted); font-size: var(--fs-sm); line-height: var(--lh-relaxed); margin-bottom: var(--space-6);">' +
      "The administration dashboard cannot reach the school's database service. " +
      "This is usually a temporary backend issue. Please check back shortly.</p>" +
      '<a href="admin-login.html" class="btn btn-secondary">Back to login</a>' +
      "</div>";
    overlay.classList.remove("is-hidden");
  }
}

async function signOutAndClear() {
  try {
    const postbase = await getClient();
    await postbase.auth.signOut();
  } catch (err) {
    /* ignore */
  }
  try { sessionStorage.removeItem(SESSION_FLAG); } catch (e) {}
}

async function performLogout() {
  await signOutAndClear();
  window.location.replace("admin-login.html");
}

/* ---- Inactivity modal ------------------------------------------- */
let idleTimer = null;
let countdownInterval = null;
let countdownRemaining = COUNTDOWN_SECONDS;
let inactivityModalOpen = false;

function resetIdleTimer() {
  if (inactivityModalOpen) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(showInactivityModal, IDLE_MS);
}

function showInactivityModal() {
  inactivityModalOpen = true;
  countdownRemaining = COUNTDOWN_SECONDS;
  $("#inactivityCountdown").textContent = countdownRemaining;
  $("#inactivityModal").classList.remove("is-hidden");
  countdownInterval = setInterval(() => {
    countdownRemaining--;
    $("#inactivityCountdown").textContent = countdownRemaining;
    if (countdownRemaining <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      performLogout();
    }
  }, 1000);
}

function dismissInactivityModal() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  inactivityModalOpen = false;
  $("#inactivityModal").classList.add("is-hidden");
  resetIdleTimer();
}

/* ---- Drafts ----------------------------------------------------- */
function saveDraft(kind) {
  const idEl = $(`#${kind}Id`);
  const titleEl = $(`#${kind}Title`);
  const contentEl = $(`#${kind}Content`);
  const publishedEl = $(`#${kind}Published`);
  if (!idEl || !titleEl || !contentEl) return;

  const title = titleEl.value;
  const content = contentEl.value;
  const id = idEl.value;
  const published = publishedEl.checked;
  const pendingFiles = formState[kind].pending.map((f) => f.name);

  if (!title && !content && pendingFiles.length === 0) {
    try { localStorage.removeItem(DRAFT_KEYS[kind]); } catch (e) {}
    return;
  }
  try {
    localStorage.setItem(
      DRAFT_KEYS[kind],
      JSON.stringify({ id, title, content, published, pendingFiles, savedAt: Date.now() })
    );
  } catch (e) {}
}

function getDraft(kind) {
  try {
    const raw = localStorage.getItem(DRAFT_KEYS[kind]);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

function clearDraft(kind) {
  try { localStorage.removeItem(DRAFT_KEYS[kind]); } catch (e) {}
}

function askToRecoverDraft(kind, draft) {
  return new Promise((resolve) => {
    const modal = $("#draftModal");
    const nameEl = $("#draftModalName");
    const filesEl = $("#draftModalFiles");
    const yesBtn = $("#draftContinueBtn");
    const noBtn = $("#draftDiscardBtn");
    nameEl.textContent = kind === "announcement" ? "announcement" : "post";
    if (draft.pendingFiles && draft.pendingFiles.length > 0) {
      filesEl.textContent =
        "Files you had selected: " +
        draft.pendingFiles.join(", ") +
        " — you'll need to re-select them.";
    } else {
      filesEl.textContent = "";
    }
    modal.classList.remove("is-hidden");
    function cleanup() {
      modal.classList.add("is-hidden");
      yesBtn.removeEventListener("click", onYes);
      noBtn.removeEventListener("click", onNo);
    }
    function onYes() { cleanup(); resolve(true); }
    function onNo() { cleanup(); clearDraft(kind); resolve(false); }
    yesBtn.addEventListener("click", onYes);
    noBtn.addEventListener("click", onNo);
  });
}

/* ---- Upload via server proxy ------------------------------------ */
async function uploadToPostFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(UPLOAD_PROXY_URL, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    let text = "";
    try { text = await res.text(); } catch (e) {}
    throw new Error(`Upload failed (${res.status}): ${text.substring(0, 150)}`);
  }
  const json = await res.json();
  const url = json.url;
  if (!url) throw new Error("No URL returned from upload");
  return url;
}

/* ---- Previews --------------------------------------------------- */
function renderPreviews(kind) {
  const container = $(`#${kind}Previews`);
  const state = formState[kind];
  if (!container) return;

  const total = state.existing.length + state.pending.length;
  const area = $(`#${kind}UploadArea`);
  if (total >= MAX_FILES) area.classList.add("is-disabled");
  else area.classList.remove("is-disabled");

  const existingHtml = state.existing
    .map((m) =>
      '<div class="preview-item" data-kind="existing" data-id="' + escapeHtml(m.id) + '">' +
      '<span class="preview-tag is-saved">Saved</span>' +
      '<button type="button" class="preview-remove" title="Remove">' + ICONS.close + "</button>" +
      (m.file_type === "image"
        ? '<img src="' + escapeHtml(m.file_url) + '" alt="" />'
        : '<span class="file-icon">' + getFileIcon(m.file_type) + "</span>") +
      '<span class="preview-name">' + escapeHtml((m.file_url || "").split("/").pop().substring(0, 20)) + "</span>" +
      "</div>"
    )
    .join("");

  const pendingHtml = state.pending
    .map((file, i) => {
      const type = getFileTypeFromMime(file.type, file.name);
      let previewContent;
      if (type === "image") {
        previewContent = '<img src="' + URL.createObjectURL(file) + '" alt="" />';
      } else {
        previewContent = '<span class="file-icon">' + getFileIcon(type) + "</span>";
      }
      return (
        '<div class="preview-item" data-kind="pending" data-idx="' + i + '">' +
        '<span class="preview-tag is-new">New</span>' +
        '<button type="button" class="preview-remove" title="Remove">' + ICONS.close + "</button>" +
        previewContent +
        '<span class="preview-name">' + escapeHtml(file.name.substring(0, 20)) + "</span>" +
        "</div>"
      );
    })
    .join("");

  container.innerHTML = existingHtml + pendingHtml;

  container.querySelectorAll(".preview-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const item = btn.closest(".preview-item");
      if (item.dataset.kind === "existing") {
        const id = item.dataset.id;
        const idx = state.existing.findIndex((m) => m.id === id);
        if (idx >= 0) {
          state.removed.push(state.existing[idx].id);
          state.existing.splice(idx, 1);
        }
      } else {
        const idx = parseInt(item.dataset.idx, 10);
        state.pending.splice(idx, 1);
      }
      renderPreviews(kind);
      saveDraft(kind);
    });
  });
}

function handleFiles(kind, fileList) {
  const state = formState[kind];
  const room = MAX_FILES - (state.existing.length + state.pending.length);
  if (room <= 0) {
    showToast("You can add up to " + MAX_FILES + " files.", "error");
    return;
  }
  const allFiles = Array.from(fileList);
  const allowed = allFiles.filter((f) => getFileTypeFromMime(f.type, f.name) !== null);
  const rejectedCount = allFiles.length - allowed.length;
  const accepted = allowed.slice(0, room);
  state.pending.push(...accepted);

  if (rejectedCount > 0) {
    showToast(
      `${rejectedCount} file${rejectedCount === 1 ? "" : "s"} skipped — only images, PDFs, and documents are allowed.`,
      "error"
    );
  }
  if (allowed.length > room) {
    showToast(`Only ${room} more file${room === 1 ? "" : "s"} could be added.`, "error");
  }
  renderPreviews(kind);
  saveDraft(kind);
}

function setupUploadArea(kind) {
  const area = $(`#${kind}UploadArea`);
  const input = $(`#${kind}FileInput`);
  if (!area || !input) return;
  input.addEventListener("change", (e) => {
    handleFiles(kind, e.target.files);
    input.value = "";
  });
  area.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!area.classList.contains("is-disabled")) area.classList.add("is-dragover");
  });
  area.addEventListener("dragleave", () => area.classList.remove("is-dragover"));
  area.addEventListener("drop", (e) => {
    e.preventDefault();
    area.classList.remove("is-dragover");
    if (area.classList.contains("is-disabled")) return;
    if (e.dataTransfer.files.length) handleFiles(kind, e.dataTransfer.files);
  });
}

/* ---- Media persistence ------------------------------------------ */
async function loadExistingMedia(kind, parentId) {
  const postbase = await getClient();
  const column = kind === "announcement" ? "announcement_id" : "post_id";
  const { data, error } = await postbase
    .from("media")
    .select("id, file_url, file_type, created_at")
    .eq(column, parentId);
  if (error) {
    console.error("Load media error:", error);
    return [];
  }
  return (data || []).sort((a, b) =>
    (a.created_at || "").localeCompare(b.created_at || "")
  );
}

async function saveMediaChanges(kind, parentId) {
  const postbase = await getClient();
  const state = formState[kind];
  const column = kind === "announcement" ? "announcement_id" : "post_id";

  for (const id of state.removed) {
    await postbase.from("media").delete().eq("id", id);
  }
  if (state.pending.length === 0) return { success: true, uploaded: 0, failed: 0 };

  let uploaded = 0;
  let failed = 0;
  for (const file of state.pending) {
    const fileType = getFileTypeFromMime(file.type, file.name);
    if (fileType === null) { failed++; continue; }
    try {
      const url = await uploadToPostFile(file);
      const payload = { file_url: url, file_type: fileType };
      payload[column] = parentId;
      const { error } = await postbase.from("media").insert(payload);
      if (error) { console.error("Insert media error:", error); failed++; }
      else { uploaded++; }
    } catch (err) {
      console.error("Upload failed for", file.name, ":", err);
      failed++;
    }
  }
  return { success: true, uploaded, failed };
}

function resetFormMedia(kind) {
  formState[kind] = { existing: [], removed: [], pending: [] };
  renderPreviews(kind);
}

/* ---- Announcements ---------------------------------------------- */
async function loadAnnouncements() {
  const container = $("#announcementsList");
  container.innerHTML =
    '<div class="state"><div class="state-icon">' + ICONS.spinner + "</div>Loading announcements…</div>";

  try {
    const postbase = await getClient();
    const { data, error } = await postbase
      .from("announcements")
      .select("id, title, content, published, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (error) throw error;

    announcementsCache = data || [];
    $("#statAnnouncements").textContent = announcementsCache.length;

    if (announcementsCache.length === 0) {
      container.innerHTML =
        '<div class="state"><div class="state-icon">' + ICONS.inbox + "</div>No announcements yet.</div>";
      updateMediaStat();
      return;
    }

    const mediaCounts = await Promise.all(
      announcementsCache.map(async (a) => {
        const { data: media } = await postbase
          .from("media")
          .select("id, file_url, file_type")
          .eq("announcement_id", a.id);
        return { id: a.id, media: media || [] };
      })
    );
    const mediaMap = Object.fromEntries(mediaCounts.map((m) => [m.id, m.media]));

    container.innerHTML = announcementsCache
      .map((a) => {
        const media = mediaMap[a.id] || [];
        const thumbs = media
          .slice(0, 8)
          .map((m) =>
            m.file_type === "image"
              ? '<img src="' + escapeHtml(m.file_url) + '" class="media-thumb" alt="" />'
              : '<div class="media-thumb">' + getFileIcon(m.file_type) + "</div>"
          )
          .join("");
        return (
          '<div class="item-card">' +
          '<div class="item-header">' +
          '<div class="item-title">' + escapeHtml(a.title) + "</div>" +
          '<span class="badge ' + (a.published ? "badge-published" : "badge-draft") + '">' +
          (a.published ? "Published" : "Draft") + "</span>" +
          "</div>" +
          '<div class="item-body">' + escapeHtml(a.content) + "</div>" +
          (thumbs ? '<div class="item-media-strip">' + thumbs + "</div>" : "") +
          '<div class="item-footer">' +
          '<div class="item-date">' + ICONS.calendar + " " + formatDate(a.created_at) +
          ' <span class="meta-sep">·</span> ' + ICONS.folder + " " + media.length +
          " file" + (media.length === 1 ? "" : "s") + "</div>" +
          '<div class="item-actions">' +
          '<button class="btn btn-secondary btn-sm" data-action="edit-announcement" data-id="' + a.id + '">' + ICONS.edit + " Edit</button>" +
          '<button class="btn btn-danger btn-sm" data-action="delete-announcement" data-id="' + a.id + '">' + ICONS.trash + " Delete</button>" +
          "</div>" +
          "</div>" +
          "</div>"
        );
      })
      .join("");

    updateMediaStat();
  } catch (err) {
    console.error("Load announcements error:", err);
    container.innerHTML =
      '<div class="state is-error"><div class="state-icon">' + ICONS.warning + "</div>Could not load announcements.</div>";
  }
}

async function openAnnouncementForm(item) {
  const panel = $("#announcementFormPanel");
  const title = $("#announcementFormTitle");
  const submitBtn = $("#announcementSubmitBtn");
  panel.classList.add("is-open");
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  resetFormMedia("announcement");

  const draft = getDraft("announcement");
  const draftMatches =
    draft && ((item && draft.id === item.id) || (!item && !draft.id));

  if (draftMatches) {
    const recover = await askToRecoverDraft("announcement", draft);
    if (recover) {
      $("#announcementId").value = draft.id || "";
      $("#announcementTitle").value = draft.title || "";
      $("#announcementContent").value = draft.content || "";
      $("#announcementPublished").checked = draft.published !== false;
      if (draft.id) {
        title.textContent = "Edit Announcement";
        submitBtn.textContent = "Save Changes";
        loadExistingMedia("announcement", draft.id).then((rows) => {
          formState.announcement.existing = rows;
          renderPreviews("announcement");
        });
      } else {
        title.textContent = "New Announcement";
        submitBtn.textContent = "Create Announcement";
      }
      return;
    }
  }

  if (item) {
    title.textContent = "Edit Announcement";
    submitBtn.textContent = "Save Changes";
    $("#announcementId").value = item.id;
    $("#announcementTitle").value = item.title;
    $("#announcementContent").value = item.content;
    $("#announcementPublished").checked = item.published;
    loadExistingMedia("announcement", item.id).then((rows) => {
      formState.announcement.existing = rows;
      renderPreviews("announcement");
    });
  } else {
    title.textContent = "New Announcement";
    submitBtn.textContent = "Create Announcement";
    $("#announcementForm").reset();
    $("#announcementId").value = "";
    $("#announcementPublished").checked = true;
  }
}

function closeAnnouncementForm() {
  $("#announcementFormPanel").classList.remove("is-open");
  $("#announcementForm").reset();
  $("#announcementId").value = "";
  resetFormMedia("announcement");
}

async function submitAnnouncement(e) {
  e.preventDefault();
  const id = $("#announcementId").value;
  const title = $("#announcementTitle").value.trim();
  const content = $("#announcementContent").value.trim();
  const published = $("#announcementPublished").checked;
  const submitBtn = $("#announcementSubmitBtn");
  const pendingCount = formState.announcement.pending.length;

  if (!title || !content) {
    showToast("Please fill in both title and content.", "error");
    return;
  }

  submitBtn.disabled = true;
  const originalLabel = submitBtn.innerHTML;
  submitBtn.textContent = "Saving…";

  let savedId = id;
  let error;
  try {
    const postbase = await getClient();
    if (id) {
      ({ error } = await postbase
        .from("announcements")
        .update({ title, content, published })
        .eq("id", id));
    } else {
      const result = await postbase
        .from("announcements")
        .insert({ title, content, published })
        .select();
      error = result.error;
      if (!error && result.data && result.data[0]) savedId = result.data[0].id;
    }

    if (error) throw error;
    if (!savedId) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalLabel;
      showToast("Saved, but could not link files.", "error");
      closeAnnouncementForm();
      loadAnnouncements();
      return;
    }

    if (pendingCount > 0) {
      submitBtn.textContent =
        "Uploading " + pendingCount + " file" + (pendingCount === 1 ? "" : "s") + "…";
      try {
        const result = await saveMediaChanges("announcement", savedId);
        if (result.failed > 0) {
          showToast(`${result.uploaded} uploaded, ${result.failed} failed.`, "error");
        } else {
          showToast(id ? "Announcement updated." : "Announcement created.", "success");
        }
      } catch (err) {
        console.error("saveMediaChanges error:", err);
        showToast("File upload failed: " + err.message, "error");
      }
    } else {
      showToast(id ? "Announcement updated." : "Announcement created.", "success");
    }

    clearDraft("announcement");
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalLabel;
    closeAnnouncementForm();
    loadAnnouncements();
  } catch (err) {
    console.error("Save announcement error:", err);
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalLabel;
    showToast("Save failed: " + (err.message || "Unknown error"), "error");
  }
}

async function handleAnnouncementListClick(e) {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === "edit-announcement") {
    const item = announcementsCache.find((a) => a.id === id);
    if (item) openAnnouncementForm(item);
  }
  if (action === "delete-announcement") {
    const item = announcementsCache.find((a) => a.id === id);
    if (!item) return;
    if (!confirm('Delete "' + item.title + '"?\n\nThis cannot be undone.')) return;
    btn.disabled = true;
    try {
      const postbase = await getClient();
      const { error } = await postbase.from("announcements").delete().eq("id", id);
      if (error) throw error;
      showToast("Announcement deleted.", "success");
      loadAnnouncements();
    } catch (err) {
      showToast("Delete failed: " + (err.message || "Unknown error"), "error");
      btn.disabled = false;
    }
  }
}

/* ---- Posts (mirrors announcements logic) ------------------------ */
async function loadPosts() {
  const container = $("#postsList");
  container.innerHTML =
    '<div class="state"><div class="state-icon">' + ICONS.spinner + "</div>Loading posts…</div>";

  try {
    const postbase = await getClient();
    const { data, error } = await postbase
      .from("posts")
      .select("id, title, content, published, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (error) throw error;

    postsCache = data || [];
    $("#statPosts").textContent = postsCache.length;

    if (postsCache.length === 0) {
      container.innerHTML =
        '<div class="state"><div class="state-icon">' + ICONS.inbox + "</div>No posts yet.</div>";
      updateMediaStat();
      return;
    }

    const mediaCounts = await Promise.all(
      postsCache.map(async (p) => {
        const { data: media } = await postbase
          .from("media")
          .select("id, file_url, file_type")
          .eq("post_id", p.id);
        return { id: p.id, media: media || [] };
      })
    );
    const mediaMap = Object.fromEntries(mediaCounts.map((m) => [m.id, m.media]));

    container.innerHTML = postsCache
      .map((p) => {
        const media = mediaMap[p.id] || [];
        const thumbs = media
          .slice(0, 8)
          .map((m) =>
            m.file_type === "image"
              ? '<img src="' + escapeHtml(m.file_url) + '" class="media-thumb" alt="" />'
              : '<div class="media-thumb">' + getFileIcon(m.file_type) + "</div>"
          )
          .join("");
        return (
          '<div class="item-card">' +
          '<div class="item-header">' +
          '<div class="item-title">' + escapeHtml(p.title) + "</div>" +
          '<span class="badge ' + (p.published ? "badge-published" : "badge-draft") + '">' +
          (p.published ? "Published" : "Draft") + "</span>" +
          "</div>" +
          '<div class="item-body">' + escapeHtml(p.content) + "</div>" +
          (thumbs ? '<div class="item-media-strip">' + thumbs + "</div>" : "") +
          '<div class="item-footer">' +
          '<div class="item-date">' + ICONS.calendar + " " + formatDate(p.created_at) +
          ' <span class="meta-sep">·</span> ' + ICONS.folder + " " + media.length +
          " file" + (media.length === 1 ? "" : "s") + "</div>" +
          '<div class="item-actions">' +
          '<button class="btn btn-secondary btn-sm" data-action="edit-post" data-id="' + p.id + '">' + ICONS.edit + " Edit</button>" +
          '<button class="btn btn-danger btn-sm" data-action="delete-post" data-id="' + p.id + '">' + ICONS.trash + " Delete</button>" +
          "</div>" +
          "</div>" +
          "</div>"
        );
      })
      .join("");

    updateMediaStat();
  } catch (err) {
    console.error("Load posts error:", err);
    container.innerHTML =
      '<div class="state is-error"><div class="state-icon">' + ICONS.warning + "</div>Could not load posts.</div>";
  }
}

async function openPostForm(item) {
  const panel = $("#postFormPanel");
  const title = $("#postFormTitle");
  const submitBtn = $("#postSubmitBtn");
  panel.classList.add("is-open");
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  resetFormMedia("post");

  const draft = getDraft("post");
  const draftMatches =
    draft && ((item && draft.id === item.id) || (!item && !draft.id));

  if (draftMatches) {
    const recover = await askToRecoverDraft("post", draft);
    if (recover) {
      $("#postId").value = draft.id || "";
      $("#postTitle").value = draft.title || "";
      $("#postContent").value = draft.content || "";
      $("#postPublished").checked = draft.published !== false;
      if (draft.id) {
        title.textContent = "Edit Post";
        submitBtn.textContent = "Save Changes";
        loadExistingMedia("post", draft.id).then((rows) => {
          formState.post.existing = rows;
          renderPreviews("post");
        });
      } else {
        title.textContent = "New Post";
        submitBtn.textContent = "Create Post";
      }
      return;
    }
  }

  if (item) {
    title.textContent = "Edit Post";
    submitBtn.textContent = "Save Changes";
    $("#postId").value = item.id;
    $("#postTitle").value = item.title;
    $("#postContent").value = item.content;
    $("#postPublished").checked = item.published;
    loadExistingMedia("post", item.id).then((rows) => {
      formState.post.existing = rows;
      renderPreviews("post");
    });
  } else {
    title.textContent = "New Post";
    submitBtn.textContent = "Create Post";
    $("#postForm").reset();
    $("#postId").value = "";
    $("#postPublished").checked = true;
  }
}

function closePostForm() {
  $("#postFormPanel").classList.remove("is-open");
  $("#postForm").reset();
  $("#postId").value = "";
  resetFormMedia("post");
}

async function submitPost(e) {
  e.preventDefault();
  const id = $("#postId").value;
  const title = $("#postTitle").value.trim();
  const content = $("#postContent").value.trim();
  const published = $("#postPublished").checked;
  const submitBtn = $("#postSubmitBtn");
  const pendingCount = formState.post.pending.length;

  if (!title || !content) {
    showToast("Please fill in both title and content.", "error");
    return;
  }

  submitBtn.disabled = true;
  const originalLabel = submitBtn.innerHTML;
  submitBtn.textContent = "Saving…";

  let savedId = id;
  let error;
  try {
    const postbase = await getClient();
    if (id) {
      ({ error } = await postbase
        .from("posts")
        .update({ title, content, published })
        .eq("id", id));
    } else {
      const result = await postbase
        .from("posts")
        .insert({ title, content, published })
        .select();
      error = result.error;
      if (!error && result.data && result.data[0]) savedId = result.data[0].id;
    }

    if (error) throw error;
    if (!savedId) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalLabel;
      showToast("Saved, but could not link files.", "error");
      closePostForm();
      loadPosts();
      return;
    }

    if (pendingCount > 0) {
      submitBtn.textContent =
        "Uploading " + pendingCount + " file" + (pendingCount === 1 ? "" : "s") + "…";
      try {
        const result = await saveMediaChanges("post", savedId);
        if (result.failed > 0) {
          showToast(`${result.uploaded} uploaded, ${result.failed} failed.`, "error");
        } else {
          showToast(id ? "Post updated." : "Post created.", "success");
        }
      } catch (err) {
        console.error("saveMediaChanges error:", err);
        showToast("File upload failed: " + err.message, "error");
      }
    } else {
      showToast(id ? "Post updated." : "Post created.", "success");
    }

    clearDraft("post");
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalLabel;
    closePostForm();
    loadPosts();
  } catch (err) {
    console.error("Save post error:", err);
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalLabel;
    showToast("Save failed: " + (err.message || "Unknown error"), "error");
  }
}

async function handlePostListClick(e) {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === "edit-post") {
    const item = postsCache.find((p) => p.id === id);
    if (item) openPostForm(item);
  }
  if (action === "delete-post") {
    const item = postsCache.find((p) => p.id === id);
    if (!item) return;
    if (!confirm('Delete "' + item.title + '"?\n\nThis cannot be undone.')) return;
    btn.disabled = true;
    try {
      const postbase = await getClient();
      const { error } = await postbase.from("posts").delete().eq("id", id);
      if (error) throw error;
      showToast("Post deleted.", "success");
      loadPosts();
    } catch (err) {
      showToast("Delete failed: " + (err.message || "Unknown error"), "error");
      btn.disabled = false;
    }
  }
}

/* ---- Stats ------------------------------------------------------ */
async function updateMediaStat() {
  try {
    const postbase = await getClient();
    const { data, error } = await postbase.from("media").select("id");
    if (error) {
      $("#statMedia").textContent = "0";
      return;
    }
    $("#statMedia").textContent = (data || []).length;
  } catch (e) {
    $("#statMedia").textContent = "0";
  }
}

/* ---- Tabs ------------------------------------------------------- */
function initTabs() {
  $all(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      $all(".tab-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
      $all(".admin-section").forEach((s) => {
        s.classList.toggle("is-active", s.id === "section-" + tab);
      });
    });
  });
}

/* ---- Master init ------------------------------------------------ */
export async function initAdminDashboard() {
  const ok = await requireAuth();
  if (!ok) return;

  $("#loadingOverlay")?.classList.add("is-hidden");

  // Header buttons
  $("#logoutBtn").addEventListener("click", async () => {
    if (!confirm("Sign out of the admin dashboard?")) return;
    await performLogout();
  });
  $("#goToSiteBtn").addEventListener("click", async () => {
    await signOutAndClear();
    window.location.href = "index.html";
  });
  $("#imHereBtn").addEventListener("click", dismissInactivityModal);

  // Idle reset listeners
  ["mousemove", "keydown", "click", "scroll", "touchstart"].forEach((evt) => {
    document.addEventListener(evt, resetIdleTimer, { passive: true });
  });

  // Draft auto-save listeners
  ["announcement", "post"].forEach((kind) => {
    const titleEl = $(`#${kind}Title`);
    const contentEl = $(`#${kind}Content`);
    if (titleEl) titleEl.addEventListener("input", () => saveDraft(kind));
    if (contentEl) contentEl.addEventListener("input", () => saveDraft(kind));
  });

  // Tabs
  initTabs();

  // Upload areas
  setupUploadArea("announcement");
  setupUploadArea("post");

  // Form open/close
  $("#newAnnouncementBtn").addEventListener("click", () => openAnnouncementForm());
  $("#announcementCancelBtn").addEventListener("click", closeAnnouncementForm);
  $("#announcementForm").addEventListener("submit", submitAnnouncement);
  $("#announcementsList").addEventListener("click", handleAnnouncementListClick);

  $("#newPostBtn").addEventListener("click", () => openPostForm());
  $("#postCancelBtn").addEventListener("click", closePostForm);
  $("#postForm").addEventListener("submit", submitPost);
  $("#postsList").addEventListener("click", handlePostListClick);

  // Initial data
  loadAnnouncements();
  loadPosts();
  resetIdleTimer();
}
