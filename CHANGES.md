[CHANGES.md](https://github.com/user-attachments/files/35135792/CHANGES.md)
# CHANGES — Layout refinement, compact cards & spacing fixes (22 November 2026)

Scope: **visual refinement of the already-improved system**. Same rules
as before: no database changes, no rebuild, existing functionality
preserved. Diagnosed against the LIVE site, then fixed at the root.

## Problems found on the live site (measured, not guessed)

1. **Oversized black graphics under School News / Posts** — the post
   card rendered a decorative `<div class="card-icon">` containing a
   news-icon SVG that had NO width/height attributes and NO CSS sizing
   rule anywhere. Browsers size such SVGs at their default
   **300×150 px** (measured live: 302×302 px blocks). That was the
   "large black graphic". Removed the decorative block entirely — no
   replacement graphic, no reserved space.
2. **Every card stretched to the same height** — all announcement
   cards measured exactly 645 px (and post cards 881 px) regardless of
   content: the grid's default `stretch` alignment plus
   `.card-body { flex: 1 }` forced short cards to grow and pushed
   their dates/Read More down, creating large blank areas. Fixed with
   `align-items: start` on `.card-grid` so every card keeps its
   natural, content-driven height.
3. **Empty 232 px block before the footer** — the "Recently viewed"
   widget rendered an empty-state message ("Pages you visit…") into a
   section that sat between the content and the footer even when the
   visitor had no page history. The widget (and its whole section) is
   now removed from the DOM when there is nothing to show; it still
   appears normally once pages have been visited.
4. **Read More shown even for one-line messages** — now appears ONLY
   when the message is actually shortened; short messages display in
   full with no ellipsis and no reading view invitation.
5. **Loose internal spacing** — card padding reduced 32→24 px, date
   separator spacing tightened, Read More sits directly under the
   preview, image bottom gap tightened.

## Files changed

| File | Change |
|---|---|
| `assets/js/cards.js` | Removed the giant unsized news icon (root cause of the black graphics). Read More only when content > 200 chars (short messages shown in full). Card order: image → title → preview → Read More → attachment chip → date. Date line omitted when a record has no date. |
| `assets/js/media.js` | The "N attached files" chip is now a real BUTTON that opens the full-screen reader (so documents stay downloadable even on short announcements with no Read More). Attachment rows show "TYPE · Added <date>" metadata. |
| `assets/js/qol.js` | Recently-viewed widget: when there is no history, the widget's section is removed entirely (kills the empty block before the footer). Also fixed a latent `"#" + id || id` bug. |
| `assets/css/components.css` | `.card-grid { align-items: start }` (natural heights). `.announcement-card` padding 24 px (hero margins matched). `.card-meta` spacing tightened. Read More / chip spacing tightened + hover/focus states for the chip. Reader hero image capped at `max-height: 460px`. |
| `functions/api/health.js` | **Deleted (again)** — the temporary diagnostic endpoint was still in the repo. It must also be deleted on GitHub. |
| `CHANGES.md` | This section. |

## Verification performed

- `node --check` on all changed JS; all 35 unit tests still pass.
- Full browser test on a local rig with seeded short/long ×
  image/no-image announcements and posts: card heights now vary with
  content (633 / 412 / 249 / 470 / 555 / 133 px — previously all 645);
  zero elements larger than 100 px that aren't content; short cards
  show the complete message with no Read More; image-less cards have
  no placeholder; the no-date record shows no date line; chip opens
  the reader; reader + document details + scroll restore unchanged.
- Mobile (390 px): no horizontal overflow, close button reachable.
- LIVE site: lockout state, Admin-button unresponsiveness, form
  disabling with no countdown, automatic restore after ~30 s, and a
  clean 401 (fresh counter) after expiry all confirmed on
  school-test-ena.pages.dev.

---

# CHANGES — UI improvements & admin security (20 November 2026)

Scope: **enhancement of the existing system only**. No rebuild, no
redesign of working pages, no database changes, no schema migration.
All announcements, posts, media, the admin account and every existing
table/column/record are untouched.

## 1. Files added

| File | Purpose |
|---|---|
| `lib/login-guard.js` | Server-side 3-strikes lockout state machine (pure module, unit-tested). After 3 consecutive failed logins within 10 minutes, that IP is locked out of `POST /api/auth/login` for 30 seconds. State lives in Worker memory — **no new database table**. Successful login or lock expiry resets the counter. |
| `assets/js/cards.js` | ONE shared announcement/post card component used by the homepage AND the Announcements page: hero image → title → cleanly-truncated preview (word-boundary safe, `…` when shortened) → attachment summary chip → date → **Read More…** button. |
| `assets/js/reader.js` | Full-screen reading experience: complete announcement/post view (hero image, full text, every attachment with its existing View/Download plus a per-document Read More…) and a document details view (type icon, file name, type, added date, View/Download). X button or Escape closes; the page is never reloaded and the visitor's scroll position is restored. Closing a document view returns into the announcement you were reading. |

## 2. Files changed

| File | Change |
|---|---|
| `assets/js/home.js` | Renders announcements and posts through the shared `cards.js` (previously dumped the full content into every card). States/empty/loading handling unchanged. |
| `assets/js/announcements.js` | Dedicated Announcements page now renders the SAME shared cards (was an editorial list with full text). Same data source, no duplicate system. |
| `assets/js/utils.js` | Added `truncatePreview(text, maxChars)` — word-boundary-safe truncation with ellipsis. Existing helpers untouched. |
| `assets/js/media.js` | Added `renderAttachmentSummary()` (compact "N attached files" chip for cards) and an optional `withDetails` flag on `renderMediaCard()` that adds a per-document "Read More…" button inside the reader. Existing row markup/View/Download preserved; `renderMediaCard` remains backward compatible. |
| `assets/js/api.js` | Error objects now carry the parsed response body as `error.data` (read-only addition) so the login page can detect `{ locked: true }`. |
| `assets/js/admin-auth.js` | On a 3rd consecutive failed attempt (server responds `{ locked: true }`) the visitor is redirected to the public homepage immediately. On page load the form checks `/api/auth/session` and, while locked, is disabled with the message "Administrator sign-in is temporarily unavailable." — no countdown, no duration — and polls every 3s until the server restores access. |
| `assets/js/nav.js` | While the server reports a lockout, the nav **Admin button is completely unresponsive** (muted, `pointer-events: none`, click prevented, `aria-disabled`), with an automatic restore via a 3-second server poll. |
| `lib/auth.js` | `handleLogin` consults the guard: locked IPs are rejected **before credentials are checked** (429 + `{ locked: true }`, message never mentions the duration); 3rd failure creates the 30s lock; success resets the counter. The existing 8-failures/10-minute limiter is kept as a backstop. Exports `isLoginLocked()`. |
| `functions/api/[[route]].js` | `GET /api/auth/session` now also returns `loginLocked` (boolean) so public pages can reflect the lock state. |
| `assets/css/components.css` | Card hero image (edge-to-edge top image), attachment summary chip, Read More button, `attach-btn.more`, and the full `.reader` section — all built on existing design tokens (light/dark themes work automatically). |
| `assets/css/layout.css` | `.nav-admin a.is-locked` style (muted, non-interactive). |
| `CHANGES.md` | This section. |

## 3. Files removed

| File | Why |
|---|---|
| `functions/api/health.js` | Temporary diagnostic endpoint from the deployment debugging session (2026-11-18). No longer needed; it reported env-var/connection status publicly. |

## 4. Security notes

- The lockout is a **real server-side restriction**: every login attempt is
  evaluated by the Worker, so refreshing, opening a new tab, or re-opening
  the login URL cannot bypass it. State is in Worker memory (per
  Cloudflare isolate/PoP) because no existing table fits and no new table
  was allowed; the wider backstop remains the 8-per-10-minute limiter and
  the WAF rule recommended in DEPLOYMENT.md.
- No credentials, hashes, durations or countdowns are exposed anywhere.

## 5. Verification performed before delivery

- `node --check` on all 22 JS files: clean.
- Unit tests: `scripts/test-login-guard.mjs` (20 assertions) and
  `scripts/test-truncate.mjs` (15 assertions) — all passing. One real bug
  found and fixed by these tests (epoch-0 falsy handling in the guard).
- Full browser test (headless Chromium against a local rig implementing
  the same API contract, using the real `login-guard.js`): card layout
  and truncation on homepage + Announcements page; image/no-image/no-media
  variants; reader opens with complete text and attachments; X and Escape
  close; scroll position restored exactly (1500→1500); document details
  round-trip returns into the announcement at the same inner scroll;
  lockout sequence (2 failures → usable, 3rd → redirect, locked button
  unresponsive, direct URL + refresh blocked, no countdown, automatic
  restore after 30s, correct login works afterwards, sign-out confirm
  intact); iPhone-14 emulation (no overflow, 44px touch targets, close
  button reachable); dark theme rendering. Zero unexpected console errors.

---

# CHANGES — Neon PostgreSQL migration (16 November 2026)

Scope: **database migration only**. No page was redesigned, no feature
was removed, no branding changed. Every UI behaviour below is preserved
exactly as it was in the PostBase build. Where the old code had a bug
that blocked the site from running at all, the fix is listed separately
and is the minimum change required.

---

## 1. Files added

| File | Purpose |
|---|---|
| `lib/neon.js` | Neon HTTP SQL client using plain `fetch` (protocol matches `@neondatabase/serverless` HTTP mode). Parses Postgres text values by column type and normalises timestamps to ISO strings. Runs only server-side. |
| `lib/auth.js` | Admin authentication: PBKDF2-SHA256 password verification (same format as `admin-password-setup.html`), session creation/validation in `admin_sessions`, HttpOnly+Secure+SameSite=Strict cookies, login rate limiting, logout revocation. |
| `lib/validate.js` | Server-side validation for every write: title ≤200, content ≤20,000, published boolean, attachment URL allowlist (PostFile hosts only, HTTPS), UUID checks. |
| `functions/api/[[route]].js` | All API endpoints: `/api/auth/{login,logout,session}`, `/api/public/{announcements,posts}`, `/api/admin/{stats,announcements,posts}` (+ `/:id` PUT/DELETE). Every SQL statement is parameterized; errors returned to the browser are safe and generic (details go to server logs only). |
| `assets/js/api.js` | Same-origin JSON fetch client that replaces the PostBase browser SDK. Preserves network-error message semantics so maintenance-mode detection still works. |
| `assets/js/init-home.js`, `init-public.js`, `init-announcements.js`, `init-admin-login.js`, `init-admin-dashboard.js` | **These five entry modules were referenced by every HTML page but missing from the repository** — without them no page ever loaded data. Rebuilt as thin wiring files that call the existing initialisers (`initThemeToggle`, `initQualityOfLife`, `initHome`, `initAnnouncementsPage`, `initAdminLogin`, `initAdminDashboard`). |
| `schema.sql` | (Delivered separately in Stage 2) tables, constraints, indexes for Neon. |
| `admin-password-setup.html` | (Delivered separately in Stage 3) local-only tool that hashes the admin password. Not part of the website; do not commit. |

## 2. Files changed

| File | Change |
|---|---|
| `assets/js/home.js` | Data layer swapped: `GET /api/public/announcements?limit=6` / `GET /api/public/posts?limit=6` (media embedded in the response). Rendering, states and lightbox wiring unchanged. |
| `assets/js/announcements.js` | Data layer swapped: `GET /api/public/announcements`. Rendering unchanged (attachments appear as a file-count badge, exactly as before). |
| `assets/js/admin-auth.js` | Login now posts to `/api/auth/login`; session check via `/api/auth/session`; error mapping by status code (401 → "Incorrect email or password…", 429 → "Too many attempts…"). All UI behaviour (password toggle, messages, maintenance mode) unchanged. |
| `assets/js/admin-dashboard.js` | Data layer swapped to `/api/admin/*` + `/api/auth/logout`. Attachment flow: pending files upload first (button shows "Uploading N files…"), then one atomic save request links uploaded files and removes unticked existing ones. Per-file "N uploaded, M failed" toasts preserved. Draft recovery, inactivity modal, tabs, stats unchanged. |
| `functions/api/upload.js` | Now requires a valid admin session **server-side** before forwarding to PostFile. Previously it accepted files from anyone — a security hole this migration closes. MIME/size validation unchanged. |
| `_headers` | CSP: `script-src` drops jsDelivr and pins the inline theme bootstrap by `sha256-` hash; `img-src` gains `https://cdn.postfile.download` (uploaded images were previously blocked by the old CSP) and `blob:` (admin upload previews); `connect-src` shrinks to `'self'` (no browser→database traffic exists anymore). Added `no-store` for `/api/*`. |
| `DEPLOYMENT.md` | Rewritten for the Neon architecture (env vars, local dev, production/preview secrets, hardening, verification checklist). |
| `IMPLEMENTATION_REPORT.md` | Historical banner added noting it describes the pre-Neon build. |
| `dev.vars.example`, `.dev.vars.example` | **Real credentials removed** — placeholders only. The values that were committed here (and in the old DEPLOYMENT.md) must be rotated; see below. |
| All 8 `.html` pages | One 12-line inline script added after the viewport meta: applies the saved theme before first paint (removes the dark-mode flash). The site's CSP allows it via its `sha256-` hash. No other HTML change. |

## 3. Files removed

| File | Why |
|---|---|
| `assets/js/postbase.js` | PostBase browser SDK client — replaced by `api.js`. |
| `assets/js/config.js` | Runtime config loader for `/api/config` — the browser no longer receives any database configuration. |
| `functions/api/config.js` | Endpoint that served the PostBase anon key — obsolete and removed deliberately: after migration the browser holds **zero** database credentials. |

## 4. Bugs found during inspection (and their fixes)

1. **Missing entry modules** (site could not run at all) → five `init-*.js` files rebuilt (§1).
2. **`/api/upload` accepted anonymous uploads** → admin session now required server-side.
3. **CSP blocked uploaded images** (`img-src` lacked `cdn.postfile.download`) and admin upload previews (`blob:`) → CSP corrected.
4. **Live-looking secrets committed** in `dev.vars.example`, `.dev.vars.example` and the old `DEPLOYMENT.md` → redacted to placeholders. **Action required: rotate the PostFile API key** (and retire the PostBase anon key with the old backend).
5. **Theme flash on load** → inline pre-paint bootstrap added (hash-pinned in CSP).
6. `robots.txt` still points `Sitemap:` at a placeholder URL — left unchanged (out of migration scope; flag for a content pass).

## 5. Behaviour notes (identical UX, different internals)

- **Attachment saving is now atomic**: the parent row and its new media rows are written in a single SQL statement (CTE), so a post can never end up published with half-linked attachments. Trade-off: files are uploaded to PostFile *before* the save request; if the save fails, uploaded files stay in PostFile unlinked (harmless, invisible).
- **Idle sessions** are revoked server-side after 30 minutes of inactivity and hard-expire after 12 hours. The dashboard's own 60-second inactivity modal is unchanged and signs you out far earlier.
- **Login errors never enumerate accounts**: "unknown email" and "wrong password" return the same message.

## 6. Verification performed before delivery

- `node --check` on all 21 JS files: clean.
- Automated test suite (`scripts/test-router.mjs`, 19 assertions): runs the **real** router and auth code with a mock Neon HTTP endpoint — covers login (real PBKDF2), cookie issuance, session validation, anonymous-request rejection (401) for `/api/admin/*` and `/api/upload`, public list shape (ISO dates, parsed booleans, embedded media), create/update/delete including unknown-id 404s, oversized-title and foreign-URL rejection, idle-session revocation, logout, and JSON 404s. All passing.
- One real bug was caught and fixed by these tests during development (session hash stored unhexed), which is exactly what Stage 6/7 testing would otherwise have surfaced in production.
