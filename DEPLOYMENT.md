[DEPLOYMENT.md](https://github.com/user-attachments/files/35135813/DEPLOYMENT.md)
# Greenwood High School — Deployment Guide (Neon edition)

This guide covers deploying the Greenwood High School website to
**Cloudflare Pages** with **Neon PostgreSQL** as the database. All
credentials are stored as server-side Cloudflare environment variables —
never in HTML, CSS or client-side JavaScript, and never committed to Git.

For the full list of what changed in the migration, see `CHANGES.md`.

---

## 1. Architecture summary

| Aspect                | Before (PostBase)                              | Now (Neon)                                                              |
| --------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| Database              | PostBase (Supabase-style, browser SDK + RLS)   | **Neon PostgreSQL**, reached only from server-side Pages Functions       |
| Data access           | PostBase SDK loaded in the browser             | Same-origin `/api/*` endpoints (`functions/api/[[route]].js`)            |
| Admin authentication  | PostBase auth (client SDK session)             | Server-side sessions: PBKDF2 password hash + `admin_sessions` table + HttpOnly cookie |
| Public config endpoint| `GET /api/config` served the anon key          | **Removed** — the browser needs no database configuration at all         |
| File storage          | PostFile via `/api/upload`                     | **Unchanged**, except `/api/upload` now requires an admin session        |
| Video proxy           | `/api/video`                                   | Unchanged                                                                |
| Pages, CSS, UI        | —                                              | Visually and functionally unchanged                                      |

## 2. File structure

```
greenwood-neon/
├── index.html                  ← homepage
├── about.html
├── announcement.html
├── contacts.html
├── admin-login.html
├── administration.html         ← admin dashboard
├── privacy.html
├── terms.html
├── assets/
│   ├── css/                    ← unchanged design system (7 files)
│   └── js/
│       ├── api.js              ← NEW: same-origin fetch client
│       ├── utils.js            ← unchanged
│       ├── theme.js            ← unchanged
│       ├── nav.js              ← unchanged
│       ├── qol.js              ← unchanged
│       ├── media.js            ← unchanged
│       ├── home.js             ← data layer swapped to /api/public/*
│       ├── announcements.js    ← data layer swapped to /api/public/*
│       ├── admin-auth.js       ← login via /api/auth/*
│       ├── admin-dashboard.js  ← data layer swapped to /api/admin/*
│       ├── init-home.js        ← NEW: page entry module
│       ├── init-public.js      ← NEW: page entry module
│       ├── init-announcements.js ← NEW: page entry module
│       ├── init-admin-login.js   ← NEW: page entry module
│       └── init-admin-dashboard.js ← NEW: page entry module
├── functions/
│   └── api/
│       ├── [[route]].js        ← NEW: all /api endpoints (Neon)
│       ├── upload.js           ← PostFile proxy, admin session required
│       └── video.js            ← unchanged
├── lib/
│   ├── neon.js                 ← NEW: Neon HTTP SQL client (no npm deps)
│   ├── auth.js                 ← NEW: password verify + sessions + cookies
│   └── validate.js             ← NEW: server-side input validation
├── _headers                    ← CSP updated (see below)
├── robots.txt
├── dev.vars.example            ← placeholders only
└── CHANGES.md                  ← full change log
```

Database schema: see `schema.sql` (announcements, posts, media,
admin_users, admin_sessions). The admin password is created locally with
`admin-password-setup.html` (kept off the repository) and produces the
PBKDF2 hash stored in `admin_users`.

## 3. Environment variables

The application needs **three** variables. There is no browser-side
database configuration anymore.

| Variable              | Example                                                              | Used by                     |
| --------------------- | -------------------------------------------------------------------- | --------------------------- |
| `NEON_DATABASE_URL`   | `postgresql://USER:PASSWORD@EP-NAME-pooler.REGION.aws.neon.tech/DBNAME?sslmode=require` | all `/api/*` endpoints |
| `POSTFILE_API_KEY`    | `pf_…` (server-side secret)                                          | `/api/upload`               |
| `POSTFILE_UPLOAD_URL` | `https://postfile.net/v1/upload` (optional — defaults to this)       | `/api/upload`               |

For Neon, copy the **pooled** connection string (Console → Dashboard →
**Connect** → *Pooled connection*). The pooled endpoint plays best with
serverless functions; `sslmode=require` must stay in the string.

`POSTBASE_URL`, `POSTBASE_ANON_KEY` and `POSTBASE_PROJECT_ID` are
**obsolete** — remove them from the Cloudflare dashboard after go-live.
The values that were committed in old versions of this repository are
considered compromised: rotate the PostFile key in the PostFile
dashboard and set the new value only here.

### Local development

```bash
# from the repository root
cp dev.vars.example .dev.vars      # then edit .dev.vars with real values
npx wrangler pages dev             # serves the site + functions on http://localhost:8788
```

`.dev.vars` is git-ignored. Never commit it, and never paste its values
into chat, issues or client code.

### Production & preview environments

In **Cloudflare Dashboard → Workers & Pages → your Pages project →
Settings → Environment variables**:

1. Add each variable to **Production** first, marked **Encrypt**
   (secret). Secrets are write-only: once saved, values can be rotated
   but not read back — that is expected.
2. Add the same variables to **Preview** (you may point Preview at the
   same Neon project, or at a second Neon project/branch for staging).
3. Every push to the production branch deploys with Production values;
   preview deployments use Preview values. Verify both after deploying.

## 4. Deploy

1. Commit the new code to the Git repository connected to the Pages
   project.
2. Push. Cloudflare builds (no build step is needed — static assets +
   `functions/` are detected automatically) and deploys.
3. Watch the deployment log: Pages should report the function routes
   `/api/*` being uploaded. If functions are missing, confirm the
   project is connected to Git (drag-and-drop deployments do not
   include Functions).

## 5. Content-Security-Policy notes

`_headers` sets a strict CSP. During the migration it changed:

- `script-src` now pins the small inline theme bootstrap by its
  `sha256-` hash (jsDelivr is no longer needed — nothing is loaded from
  it). If you edit that inline script, update its hash in `_headers`.
- `img-src` now includes `https://cdn.postfile.download` (uploaded media)
  and `blob:` (admin upload previews). These were missing before and
  would have blocked images.
- `connect-src` is now just `'self'` — the browser talks only to this
  site's own API. Database traffic happens entirely server-side.

## 6. Hardening recommendations

- **Login rate limiting:** the Functions include a best-effort
  in-memory limiter. Also add a Cloudflare WAF rate-limiting rule for
  `/api/auth/login` (e.g. 10 requests / minute / IP) as the primary
  control: Dashboard → your domain → Security → WAF → Rate limiting
  rules.
- **Backups:** the Neon Free plan keeps point-in-time restore history
  on the branch. For an extra safety net, keep a periodic logical dump
  (a small `.sql` file) of `announcements`, `posts` and `media` — the
  dataset is small. Console → SQL Editor → export, or `pg_dump` with
  the connection string.
- **Rotate secrets** that ever appeared in Git history (see §3).

## 7. Post-deploy verification

1. Homepage and announcements page load published content from Neon.
2. View-source + DevTools Network: no `/api/config` call, no database
   URL, no keys — only same-origin `/api/*` calls and PostFile CDN media.
3. Admin login works; wrong password shows the polite error; five rapid
   failures triggers the limiter.
4. Create/edit/delete announcements and posts with attachments; publish
   toggle hides content publicly but keeps it in the dashboard.
5. `curl -X POST https://your-site/api/upload` (no cookie) → 401.
   `curl https://your-site/api/admin/announcements` (no cookie) → 401.
6. Inactivity modal still signs you out after 60 s idle; session cookie
   is gone after logout.
7. Mobile: navigation, lightbox, uploads and dashboard all usable.
8. Preview deployment tested separately from Production.
