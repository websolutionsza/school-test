/* =====================================================================
   Greenwood High School — API router (catch-all Pages Function)
   ---------------------------------------------------------------------
   Handles every /api/* route except /api/upload and /api/video, which
   have their own function files. This is the ONLY place the database
   is touched from, and it runs exclusively on Cloudflare's servers.

   Route map:
     POST   /api/auth/login                     → lib/auth.handleLogin
     POST   /api/auth/logout                    → lib/auth.handleLogout
     GET    /api/auth/session                   → session check
     GET    /api/public/announcements[?limit=]  → published only
     GET    /api/public/posts[?limit=]          → published only
     GET    /api/admin/stats                    → counts for dashboard
     GET    /api/admin/announcements            → all, newest first
     POST   /api/admin/announcements            → create (+ attachments)
     PUT    /api/admin/announcements/:id        → update (+ add/remove)
     DELETE /api/admin/announcements/:id        → delete (cascades media)
     GET/POST/PUT/DELETE …/admin/posts(/:id)    → same for posts
     (anything else)                            → 404 JSON

   Security model:
   - /api/public/* exposes only published rows and never auth data.
   - Every /api/admin/* request requires a valid session cookie that is
     verified server-side against the admin_sessions table.
   - All SQL is parameterized; user input never becomes SQL text.
   - Responses never include database errors, credentials or SQL text.
   ===================================================================== */

import { query, normalizeDates } from "../../lib/neon.js";
import {
  json,
  handleLogin,
  handleLogout,
  getSessionUser,
  requireAdmin,
} from "../../lib/auth.js";
import {
  isUuid,
  limitParam,
  validateItemInput,
} from "../../lib/validate.js";

const GENERIC_ERROR = "Something went wrong. Please try again.";

/* Content tables share the same shape; this keeps the SQL builders
   below identical for announcements and posts. */
const KINDS = {
  announcements: { parentColumn: "announcement_id", label: "Announcement" },
  posts: { parentColumn: "post_id", label: "Post" },
};

/* ---- SQL builders ------------------------------------------------- */
function listSql(kind, { publishedOnly, limit }) {
  const table = kind;
  const parentColumn = KINDS[kind].parentColumn;
  const where = publishedOnly ? "\nWHERE a.published = true" : "";
  const limitClause = limit ? `\nLIMIT ($1)::int` : "";
  return `
SELECT a.id, a.title, a.content, a.published, a.created_at, a.updated_at,
       COALESCE(
         (SELECT json_agg(
                    json_build_object('id', m.id, 'file_url', m.file_url,
                                      'file_type', m.file_type,
                                      'created_at', m.created_at)
                    ORDER BY m.created_at, m.id)
          FROM media m
          WHERE m.${parentColumn} = a.id),
         '[]'::json) AS media
FROM ${table} a${where}
ORDER BY a.created_at DESC${limitClause}`.trim();
}

function createSql(kind) {
  const parentColumn = KINDS[kind].parentColumn;
  return `
WITH new_item AS (
  INSERT INTO ${kind} (title, content, published)
  VALUES (($1)::text, ($2)::text, ($3)::boolean)
  RETURNING id, title, content, published, created_at, updated_at
), new_media AS (
  INSERT INTO media (${parentColumn}, file_url, file_type)
  SELECT new_item.id, x->>'file_url', x->>'file_type'
  FROM new_item CROSS JOIN jsonb_array_elements(($4)::jsonb) AS x
  RETURNING id, file_url, file_type, created_at
)
SELECT row_to_json(new_item) AS item,
       COALESCE(
         (SELECT json_agg(
                    json_build_object('id', m.id, 'file_url', m.file_url,
                                      'file_type', m.file_type,
                                      'created_at', m.created_at)
                    ORDER BY m.created_at, m.id)
          FROM new_media m),
         '[]'::json) AS media
FROM new_item`.trim();
}

function updateSql(kind) {
  const parentColumn = KINDS[kind].parentColumn;
  return `
WITH upd AS (
  UPDATE ${kind}
  SET title = ($1)::text, content = ($2)::text,
      published = ($3)::boolean, updated_at = now()
  WHERE id = ($4)::uuid
  RETURNING id, title, content, published, created_at, updated_at
), del AS (
  DELETE FROM media
  WHERE ${parentColumn} = ($4)::uuid
    AND id IN (SELECT x::uuid FROM jsonb_array_elements_text(($5)::jsonb) AS x)
  RETURNING id
), ins AS (
  INSERT INTO media (${parentColumn}, file_url, file_type)
  SELECT upd.id, x->>'file_url', x->>'file_type'
  FROM upd CROSS JOIN jsonb_array_elements(($6)::jsonb) AS x
  RETURNING id, file_url, file_type, created_at
)
SELECT row_to_json(upd) AS item,
       COALESCE(
         (SELECT json_agg(
                    json_build_object('id', m.id, 'file_url', m.file_url,
                                      'file_type', m.file_type,
                                      'created_at', m.created_at)
                    ORDER BY m.created_at, m.id)
          FROM ins m),
         '[]'::json) AS media
FROM upd`.trim();
}

/* ---- Handlers ------------------------------------------------------ */
async function readJsonBody(request) {
  try {
    return await request.json();
  } catch (e) {
    return null;
  }
}

async function listItems(request, env, kind, publishedOnly) {
  const url = new URL(request.url);
  const limit = publishedOnly
    ? limitParam(url.searchParams.get("limit"), 0) || undefined
    : undefined;

  const params = limit ? [limit] : [];
  const rows = await query(env, listSql(kind, { publishedOnly, limit }), params);
  return rows.map(normalizeDates);
}

async function createItem(env, kind, body) {
  const validated = validateItemInput(body);
  if (!validated.ok) {
    const err = new Error(validated.error);
    err.status = 400;
    err.safeMessage = validated.error;
    throw err;
  }

  const { title, content, published, media } = validated.value;
  const rows = await query(
    env,
    createSql(kind),
    [title, content, published, JSON.stringify(media.add)]
  );
  const row = rows[0];
  if (!row || !row.item) {
    const err = new Error("Create failed.");
    err.status = 502;
    err.safeMessage = "Could not create the item. Please try again.";
    throw err;
  }
  return { kindLabel: KINDS[kind].label, item: row.item, media: row.media };
}

async function updateItem(env, kind, id, body) {
  const validated = validateItemInput(body);
  if (!validated.ok) {
    const err = new Error(validated.error);
    err.status = 400;
    err.safeMessage = validated.error;
    throw err;
  }

  const { title, content, published, media } = validated.value;
  const rows = await query(
    env,
    updateSql(kind),
    [
      title,
      content,
      published,
      id,
      JSON.stringify(media.remove),
      JSON.stringify(media.add),
    ]
  );
  const row = rows[0];
  if (!row || !row.item) {
    const err = new Error("Not found.");
    err.status = 404;
    err.safeMessage = KINDS[kind].label + " not found. It may have been deleted.";
    throw err;
  }
  return { kindLabel: KINDS[kind].label, item: row.item, media: row.media };
}

async function deleteItem(env, kind, id) {
  const rows = await query(
    env,
    `DELETE FROM ${kind} WHERE id = ($1)::uuid RETURNING id`,
    [id]
  );
  if (rows.length === 0) {
    const err = new Error("Not found.");
    err.status = 404;
    err.safeMessage = KINDS[kind].label + " not found. It may have been deleted.";
    throw err;
  }
  return { ok: true };
}

/* ---- Dispatcher ----------------------------------------------------- */
async function handle(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  let path = url.pathname.replace(/^\/api\//, "").replace(/\/+$/, "");

  /* ----- Auth (no session required) ----- */
  if (path === "auth/login" && method === "POST") {
    return handleLogin(request, env);
  }
  if (path === "auth/logout" && method === "POST") {
    return handleLogout(request, env);
  }
  if (path === "auth/session" && method === "GET") {
    try {
      const user = await getSessionUser(env, request);
      if (!user) return json({ authenticated: false });
      return json({
        authenticated: true,
        user: { name: user.name, email: user.email },
      });
    } catch (err) {
      // An unreachable database must not look like "not logged in".
      const e = new Error("Session check failed.");
      e.status = err && err.status ? err.status : 502;
      e.safeMessage = "The service is temporarily unavailable.";
      throw e;
    }
  }

  /* ----- Public content (read-only, published rows only) ----- */
  if (path === "public/announcements" && method === "GET") {
    const items = await listItems(request, env, "announcements", true);
    return json({ announcements: items });
  }
  if (path === "public/posts" && method === "GET") {
    const items = await listItems(request, env, "posts", true);
    return json({ posts: items });
  }

  /* ----- Admin (session required for everything below) ----- */
  if (path.startsWith("admin/")) {
    const user = await requireAdmin(env, request);
    if (!user) {
      return json({ error: "Authentication required." }, 401);
    }

    if (path === "admin/stats" && method === "GET") {
      const rows = await query(
        env,
        `SELECT (SELECT count(*)::int FROM announcements) AS announcements,
                (SELECT count(*)::int FROM posts) AS posts,
                (SELECT count(*)::int FROM media) AS media`
      );
      const stats = rows[0] || { announcements: 0, posts: 0, media: 0 };
      return json({
        announcements: stats.announcements,
        posts: stats.posts,
        media: stats.media,
      });
    }

    for (const kind of Object.keys(KINDS)) {
      if (path === "admin/" + kind && method === "GET") {
        const items = await listItems(request, env, kind, false);
        return json({ [kind]: items });
      }
      if (path === "admin/" + kind && method === "POST") {
        const body = await readJsonBody(request);
        const result = await createItem(env, kind, body);
        return json(
          { [kind.slice(0, -1)]: result.item, media: result.media },
          201
        );
      }

      const idMatch = path.match(new RegExp("^admin/" + kind + "/([^/]+)$"));
      if (idMatch) {
        const id = idMatch[1];
        if (!isUuid(id)) {
          return json({ error: "Invalid identifier." }, 400);
        }
        if (method === "PUT") {
          const body = await readJsonBody(request);
          const result = await updateItem(env, kind, id, body);
          return json(
            { [kind.slice(0, -1)]: result.item, media: result.media },
            200
          );
        }
        if (method === "DELETE") {
          return json(await deleteItem(env, kind, id));
        }
      }
    }
  }

  return json({ error: "Not found." }, 404);
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    return await handle(request, env);
  } catch (err) {
    // Real details go to the server log only — never to the browser.
    console.error("API error:", err && err.stack ? err.stack : err);
    const status = err && err.status ? err.status : 500;
    const message =
      (err && err.safeMessage) ||
      (status === 503
        ? "The service is temporarily unavailable. Please try again shortly."
        : GENERIC_ERROR);
    return json({ error: message }, status);
  }
}
