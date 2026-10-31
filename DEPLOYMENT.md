[DEPLOYMENT.md](https://github.com/user-attachments/files/34224237/DEPLOYMENT.md)
# Greenwood High School — Deployment Guide

This guide walks you through deploying the redesigned Greenwood High School
website to **Cloudflare Pages** with all API keys stored as server-side
environment variables (never in JavaScript).

---

## 1. What changed (architectural summary)

| Aspect                | Before                                       | After                                                       |
| --------------------- | -------------------------------------------- | ---------------------------------------------------------- |
| File structure        | Each HTML file had inline `<style>` and `<script>` | CSS in `assets/css/`, JS in `assets/js/`, HTML at root      |
| PostBase anon key     | Hardcoded in every page's JS                 | Fetched at runtime from `/api/config` (server-side env var) |
| PostFile API key      | Hardcoded in `upload.js` (server-side)       | Read from env var `POSTFILE_API_KEY` inside `/api/upload`   |
| Theme (light/dark)    | Not supported                                | Token-based, persisted, OS-aware, FOUC-free                 |
| Reading progress      | Not supported                                | Subtle bar on long pages only                               |
| Back-to-top           | Not supported                                | Discreet button after scroll                                |
| Recently viewed       | Not supported                                | Local-storage list, public pages only                       |
| Keyboard shortcuts    | Not supported                                | `g`+`h/a/n/c`, `t`, `?`, `Esc`                              |
| Share + copy          | Not supported                                | Web Share API + copy-link fallback                          |
| Privacy / Terms       | Not present                                  | `privacy.html` and `terms.html`                             |
| Backend integration   | Direct PostBase from browser                 | **Unchanged** — PostBase SDK still loaded in browser; auth, RLS, and data flow are identical |

The existing admin authentication, post/announcement creation, draft
recovery, file uploads, inactivity timeout, and stats are all preserved
exactly. The PostBase SDK is still loaded client-side (it has to be — it
talks to PostBase directly), but it now receives its configuration from
a server endpoint rather than a hardcoded string.

---

## 2. File structure

```
greenwood/
├── index.html                  ← homepage
├── about.html
├── announcement.html
├── contacts.html
├── admin-login.html
├── administration.html         ← admin dashboard
├── privacy.html                ← NEW legal page
├── terms.html                  ← NEW legal page
├── assets/
│   ├── css/
│   │   ├── tokens.css          ← design tokens (colors, type, dark mode)
│   │   ├── base.css            ← reset, typography, focus, a11y
│   │   ├── layout.css          ← header, nav, footer, hero, sections
│   │   ├── components.css      ← buttons, cards, forms, badges, lightbox
│   │   ├── pages.css           ← page-specific styles
│   │   ├── admin.css           ← admin dashboard styles
│   │   └── qol.css             ← back-to-top, reading progress, share, etc.
│   └── js/
│       ├── config.js           ← fetches PostBase config from /api/config
│       ├── utils.js            ← escape, dates, toasts, clipboard, share
│       ├── postbase.js         ← PostBase client singleton
│       ├── theme.js            ← dark mode toggle + persistence
│       ├── nav.js              ← mobile nav
│       ├── qol.js              ← back-to-top, reading progress, shortcuts, etc.
│       ├── media.js            ← render media cards + lightbox
│       ├── home.js             ← homepage logic
│       ├── announcements.js    ← announcements page logic
│       ├── admin-auth.js       ← admin login
│       └── admin-dashboard.js  ← admin dashboard logic
└── functions/
    └── api/
        ├── config.js           ← returns PostBase anon config from env vars
        └── upload.js           ← PostFile proxy (uses POSTFILE_API_KEY env var)
```

The `functions/` directory is special in Cloudflare Pages: every `.js`
file inside becomes a server-side endpoint. So `functions/api/config.js`
is served at `https://yoursite.pages.dev/api/config` and runs on
Cloudflare's edge — **the source code of these files is never sent to
the browser.**

---

## 3. Upload to Cloudflare Pages

### Option A — Git integration (recommended)

1. Push the `greenwood/` folder contents to a GitHub/GitLab repository.
   The repository root should contain `index.html`, `assets/`, and
   `functions/` directly.
2. In the Cloudflare dashboard:
   - **Workers & Pages → Create application → Pages → Connect to Git**
   - Pick the repository.
   - **Build command:** leave empty (this is a static site).
   - **Build output directory:** `/` (root) — or `.` if your repo root
     is the website root.
   - Click **Save and Deploy**.

### Option B — Direct upload with Wrangler

```bash
npm install -g wrangler
cd greenwood
wrangler pages deploy . --project-name=greenwood-high
```

### Option C — Drag-and-drop

Cloudflare Pages supports direct upload of a folder via the dashboard
(Workers & Pages → Create application → Pages → Direct Upload). Note
that direct upload does **not** deploy `functions/` — you must use Git
or Wrangler for the API endpoints to work.

---

## 4. Set environment variables (CRITICAL)

This is the step that actually removes the API keys from JavaScript.

In the Cloudflare Pages dashboard:

1. Open your Pages project.
2. Go to **Settings → Environment variables**.
3. Add the following variables. Set them for **both** the *Production*
   and *Preview* environments (or just Production if you prefer).

| Variable name           | Value                                                                            | Where it's used         |
| ----------------------- | -------------------------------------------------------------------------------- | ----------------------- |
| `POSTBASE_URL`          | `https://postbase-production-b4c8.up.railway.app`                                | `functions/api/config.js` |
| `POSTBASE_ANON_KEY`     | `pb_anon_fsq2eoaBVsA3NcKwKJnp7iH4TEb-ZoUOzSSVsbwhbFT26sOrKq1zSE94esDhwIy1`        | `functions/api/config.js` |
| `POSTBASE_PROJECT_ID`   | `ea6357bc-c34f-4dc2-b0ef-470facb6d9bb`                                           | `functions/api/config.js` |
| `POSTFILE_API_KEY`      | `pf_lyIGJBVbqHrpTE4qy8BLeJv6KxgJ4NoRzT_cXaz4cQs`                                 | `functions/api/upload.js` |
| `POSTFILE_UPLOAD_URL`   | `https://postfile.net/v1/upload` (optional — defaults to this)                   | `functions/api/upload.js` |

4. Click **Save**. Environment variable changes require a redeploy to
   take effect — trigger one via the dashboard or push a new commit.

> **Mark as secret (Encrypt):** Cloudflare Pages lets you mark each
> variable as encrypted. Tick this for `POSTFILE_API_KEY` so it is not
> visible in the dashboard after saving. The PostBase values can stay
> unencrypted if you wish — they are designed to be public — but
> encrypting them is harmless.

---

## 5. Verify the keys are gone from the browser

After deploy, open your live site and:

1. **View page source** of `index.html`. Search for `pb_anon` and
   `pf_`. You should find **nothing**.
2. Open DevTools → Network. Reload the page. You should see one
   `GET /api/config` request that returns:
   ```json
   { "url": "...", "anonKey": "...", "projectId": "..." }
   ```
   This is expected — the anon key is delivered to the browser at
   runtime so the PostBase SDK can talk to PostBase. It is **not** in
   your source code or git history.
3. In DevTools → Sources, open any JS file under `assets/js/`. Search
   for `pb_anon` or `pf_`. You should find **nothing**.

The PostFile API key (`pf_…`) is **never** sent to the browser. It
lives only inside `functions/api/upload.js` on Cloudflare's edge.

---

## 6. PostBase Row-Level Security (important)

The PostBase anon key is designed to be exposed to browsers — exactly
like Supabase anon keys. **The real authority for what users can read
or write is Row-Level Security (RLS) on the PostBase backend**, not the
key itself.

Make sure your PostBase policies enforce:

| Table           | Public read     | Public write   | Authenticated admin write |
| --------------- | --------------- | -------------- | ------------------------- |
| `announcements` | `published = true` only | **Deny** | Allow all (or by user id) |
| `posts`         | `published = true` only | **Deny** | Allow all (or by user id) |
| `media`         | Read where parent is published | **Deny** | Allow where user can write parent |

If these policies are not in place, anyone who finds the anon key
(which is now trivial since `/api/config` returns it) could read or
modify data. The frontend already filters to `published = true` on
public pages, but **frontend filtering is not security** — RLS is.

If you are unsure how to set RLS policies in PostBase, contact
PostBase support or check their docs. This is the single most
important security control for the application.

---

## 7. Cloudflare Pages configuration checklist

In **Settings → Functions**:

- **Functions CORS**: not needed — `/api/upload` and `/api/config` are
  same-origin.
- **Placebo `/api/*` route**: Cloudflare Pages automatically routes
  `/api/*` to the `functions/api/` directory. No extra config needed.

In **Settings → Builds & deployments**:

- **Build command**: (empty)
- **Build output directory**: `/` or `.`
- **Root directory**: (empty, or your subfolder if the site lives in a
  subdirectory of the repo)

In **Settings → Environment variables**:

- All 5 variables from section 4 added to Production (and Preview if
  you want previews to work).

---

## 8. Optional hardening (recommended for production)

### 8.1 Security headers via `_headers`

Create a `_headers` file at the site root to enforce HTTPS, prevent
clickjacking, and lock down MIME types:

```
/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
  Content-Security-Policy: default-src 'self'; img-src 'self' https://raw.githubusercontent.com data:; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; frame-src https://www.google.com; connect-src 'self' https://postbase-production-b4c8.up.railway.app https://postfile.net; base-uri 'self'; form-action 'self'

/admin/*
  X-Robots-Tag: noindex, nofollow

/admin-login.html
  X-Robots-Tag: noindex, nofollow

/administration.html
  X-Robots-Tag: noindex, nofollow
```

> The CSP allows `https://cdn.jsdelivr.net` for the PostBase SDK and
> `https://postbase-production-b4c8.up.railway.app` for the API.
> Adjust if you change CDN or backend.

### 8.2 `robots.txt`

```
User-agent: *
Allow: /
Disallow: /admin-login.html
Disallow: /administration.html
Sitemap: https://yoursite.pages.dev/sitemap.xml
```

### 8.3 Rate-limit the upload endpoint

Cloudflare Pages Functions don't have built-in rate limiting, but you
can add a Cloudflare WAF rule or use Cloudflare's Rate Limiting Rules
to throttle `POST /api/upload` per IP. This prevents abuse even if
someone bypasses the admin UI.

### 8.4 Rotate keys (if you have ever committed them)

If the original `upload.js` with the PostFile key was committed to a
public git repository, **rotate the key now** in the PostFile dashboard,
then update the Cloudflare env var. Git history keeps secrets forever.

---

## 9. Local development

The site is static, so you can serve the `greenwood/` folder with any
static server for design work:

```bash
cd greenwood
python3 -m http.server 8080
# or
npx serve .
```

However, **the `/api/config` and `/api/upload` endpoints will not exist
locally** without Wrangler. To test the full flow locally:

```bash
npm install -g wrangler
cd greenwood
# Create a .dev.vars file with the env vars (DO NOT COMMIT THIS FILE):
echo "POSTBASE_URL=https://postbase-production-b4c8.up.railway.app" > .dev.vars
echo "POSTBASE_ANON_KEY=pb_anon_..." >> .dev.vars
echo "POSTBASE_PROJECT_ID=ea6357bc-..." >> .dev.vars
echo "POSTFILE_API_KEY=pf_..." >> .dev.vars
wrangler pages dev . --binding-env .dev.vars
```

Open `http://localhost:8788`. The functions will be served from
`functions/api/` and `.dev.vars` will be loaded as environment
variables.

> **Never commit `.dev.vars` to git.** Add it to `.gitignore`.

### `.gitignore` (recommended)

```
.dev.vars
.env
node_modules/
.wrangler/
.DS_Store
```

---

## 10. Verifying everything works after deploy

Open the live site and check:

1. Homepage loads, hero section shows, "Latest Announcements" and
   "School News & Posts" populate from PostBase.
2. About, Announcements, Contact pages render with the new design.
3. Dark mode toggle works and persists across pages.
4. Back-to-top button appears after scrolling.
5. Reading progress bar appears on long pages (privacy/terms).
6. Press `?` — the keyboard shortcuts dialog opens.
7. Press `g` then `a` — navigates to About.
8. Visit Announcements page → click share → "Copy link" works.
9. Visit Contact page → "Copy address" / "Copy number" / "Copy email"
   buttons work.
10. Visit several pages → return to homepage → "Recently viewed"
    shows the pages you visited (admin pages should NOT appear).
11. Visit `/admin-login.html` → sign in with admin credentials.
12. Dashboard loads → stats populate → tabs switch.
13. Create a test announcement with an image attachment → image
    uploads via `/api/upload` (look in Network tab — request goes to
    same origin, no API key in the request).
14. Verify the new announcement appears on the public homepage.
15. Sign out → confirm you're redirected to login.

If any of these fail, check:
- **Cloudflare Pages → Functions → Logs** for errors in `/api/config`
  or `/api/upload`.
- **Browser DevTools → Console** for module loading errors.
- **Environment variables** are set for the correct environment
  (Production vs Preview).

---

## 11. Rollback

Cloudflare Pages keeps every deployment. To roll back:

1. Cloudflare Pages dashboard → your project → **Deployments**.
2. Find the last known-good deployment.
3. Click **… → Rollback to this deployment**.

Rollback is instant and doesn't require a rebuild.

---

## 12. Post-deploy security notes

- The PostBase anon key is now delivered via `/api/config`. Anyone can
  fetch it. **This is by design** and matches how Supabase and similar
  services work. Security comes from RLS policies (section 6).
- The PostFile API key is **never** sent to the browser.
- Internal errors from `/api/upload` return a vague message
  (`"Upload proxy error."`) — detailed errors are logged server-side
  only.
- File uploads are validated server-side for MIME type and size, even
  though the client also validates — defense in depth.
- The admin session uses PostBase's own auth plus a per-tab
  `sessionStorage` flag. Closing the tab signs the user out.

---

## 13. Questions / customisation

- **Want to change the navy/gold palette?** Edit
  `assets/css/tokens.css`. All colors are CSS custom properties, so
  changes cascade through every page.
- **Want a different font?** Replace the Google Fonts link in each
  HTML `<head>` and update `--font-display` / `--font-body` in
  `tokens.css`.
- **Want to add a new page?** Copy `about.html` as a template, change
  the content, and add a link in the nav (`<ul class="nav-primary">`).
- **Want to add a new admin tab?** Add a `<button class="tab-btn"
  data-tab="events">` and a matching `<section id="section-events"
  class="admin-section">`, then add the load/submit logic in
  `assets/js/admin-dashboard.js` mirroring the announcement logic.
