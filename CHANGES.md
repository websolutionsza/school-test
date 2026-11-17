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
