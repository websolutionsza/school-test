/* =====================================================================
   Greenwood High School — Authentication & session helpers
   ---------------------------------------------------------------------
   Server-side admin authentication for the Cloudflare Pages Functions.

   - Passwords are stored as PBKDF2-SHA256 hashes created by the local
     admin-password-setup.html tool:
         pbkdf2-sha256$<iterations>$<base64-salt>$<base64-hash>
     Verification recomputes the derivation and compares digests in
     constant time. Raw passwords are never stored or logged.
   - Sessions are random 32-byte tokens delivered to the browser in an
     HttpOnly + Secure + SameSite=Strict cookie. Only the SHA-256 hash
     of the token is stored in the database, so a database leak does
     not expose usable cookies.
   - Sessions slide-expire after 30 minutes of inactivity and hard-
     expire 12 hours after creation.

   NOTE on login rate limiting: the in-memory limiter below is best
   effort (it resets when an isolate is recycled). The primary defence
   should be a Cloudflare WAF rate-limiting rule on /api/auth/login —
   see DEPLOYMENT.md.
   ===================================================================== */

import { query } from "./neon.js";

export const SESSION_COOKIE = "ghs_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours (absolute)
const SESSION_IDLE_MS = 30 * 60 * 1000; // 30 minutes (sliding)
const LOGIN_MAX_FAILURES = 8;
const LOGIN_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/* ---- Small response/cookie helpers ------------------------------ */
export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export function getCookie(request, name) {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return part.slice(idx + 1).trim();
  }
  return null;
}

function sessionCookie(token, maxAgeSeconds) {
  return (
    SESSION_COOKIE +
    "=" +
    token +
    "; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=" +
    maxAgeSeconds
  );
}

/* ---- Hashing ----------------------------------------------------- */
async function sha256Bytes(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* Constant-time byte comparison (no early exit on difference). */
function digestsEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Verify a password against a stored "pbkdf2-sha256$…" hash.
 * Returns true/false; returns false (never throws) on malformed input.
 */
export async function verifyPassword(password, storedHash) {
  try {
    const parts = String(storedHash || "").split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
    const iterations = parseInt(parts[1], 10);
    if (!Number.isFinite(iterations) || iterations < 1000 || iterations > 2_000_000) {
      return false;
    }
    const salt = base64ToBytes(parts[2]);
    const expected = base64ToBytes(parts[3]);

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      key,
      expected.length * 8
    );
    return digestsEqual(new Uint8Array(bits), expected);
  } catch (e) {
    return false;
  }
}

/* ---- Sessions ----------------------------------------------------- */
async function createSession(env, userId) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToHex(tokenBytes);
  const tokenHash = bytesToHex(await sha256Bytes(token));
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await query(
    env,
    `INSERT INTO admin_sessions (user_id, token_hash, expires_at)
     VALUES (($1)::uuid, $2, ($3)::timestamptz)`,
    [userId, tokenHash, expiresAt]
  );
  return token;
}

/**
 * Validate the session cookie on an incoming request.
 * Returns { id, userId, name, email } or null. Refreshes last_seen_at
 * (sliding idle window) and revokes sessions idle for too long.
 */
export async function getSessionUser(env, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token || token.length < 32 || token.length > 128) return null;

  const tokenHash = await sha256Bytes(token);
  const rows = await query(
    env,
    `SELECT s.id AS session_id, s.user_id, s.last_seen_at, s.expires_at,
            u.name, u.email
     FROM admin_sessions s
     JOIN admin_users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
     LIMIT 1`,
    [bytesToHex(tokenHash)]
  );
  const session = rows[0];
  if (!session) return null;

  const lastSeen = new Date(session.last_seen_at).getTime();
  if (Date.now() - lastSeen > SESSION_IDLE_MS) {
    await query(
      env,
      `UPDATE admin_sessions SET revoked_at = now() WHERE id = ($1)::uuid`,
      [session.session_id]
    );
    return null;
  }

  await query(
    env,
    `UPDATE admin_sessions SET last_seen_at = now() WHERE id = ($1)::uuid`,
    [session.session_id]
  );

  return {
    sessionId: session.session_id,
    userId: session.user_id,
    name: session.name,
    email: session.email,
  };
}

/* ---- Login / logout flows ----------------------------------------- */
const loginFailures = new Map(); // ip -> { count, windowStart }

function clientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown"
  );
}

export function isLoginRateLimited(request) {
  const ip = clientIp(request);
  const entry = loginFailures.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > LOGIN_WINDOW_MS) {
    loginFailures.delete(ip);
    return false;
  }
  return entry.count >= LOGIN_MAX_FAILURES;
}

function recordLoginFailure(request) {
  const ip = clientIp(request);
  const entry = loginFailures.get(ip);
  if (!entry || Date.now() - entry.windowStart > LOGIN_WINDOW_MS) {
    loginFailures.set(ip, { count: 1, windowStart: Date.now() });
  } else {
    entry.count += 1;
  }
}

/**
 * Handle POST /api/auth/login. Returns a Response.
 * Error messages are deliberately identical for "no such user" and
 * "wrong password" so the endpoint cannot be used to enumerate accounts.
 */
export async function handleLogin(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid request." }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password || email.length > 320 || password.length > 1024) {
    return json({ error: "Please enter both your email and password." }, 400);
  }

  if (isLoginRateLimited(request)) {
    return json(
      { error: "Too many attempts. Please wait a moment and try again." },
      429
    );
  }

  let rows;
  try {
    rows = await query(
      env,
      `SELECT id, name, email, password_hash
       FROM admin_users
       WHERE lower(email) = ($1)
       LIMIT 1`,
      [email]
    );
  } catch (err) {
    const e = new Error("Authentication is temporarily unavailable.");
    e.status = err && err.status ? err.status : 502;
    throw e;
  }

  const user = rows[0];
  const ok = user ? await verifyPassword(password, user.password_hash) : false;
  if (!ok) {
    recordLoginFailure(request);
    return json({ error: "Incorrect email or password. Please try again." }, 401);
  }

  loginFailures.delete(clientIp(request));
  const token = await createSession(env, user.id);
  return json(
    { ok: true, user: { name: user.name, email: user.email } },
    200,
    { "Set-Cookie": sessionCookie(token, SESSION_TTL_MS / 1000) }
  );
}

export async function handleLogout(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (token && token.length >= 32 && token.length <= 128) {
    const tokenHash = await sha256Bytes(token);
    try {
      await query(
        env,
        `UPDATE admin_sessions SET revoked_at = now()
         WHERE token_hash = $1 AND revoked_at IS NULL`,
        [bytesToHex(tokenHash)]
      );
    } catch (e) {
      /* revocation is best effort on logout */
    }
  }
  return json({ ok: true }, 200, {
    "Set-Cookie": sessionCookie("", 0),
  });
}

/**
 * Guard for /api/admin/* and /api/upload.
 * Returns the session user, or null when there is no valid session
 * (callers must respond 401 in that case).
 */
export async function requireAdmin(env, request) {
  return getSessionUser(env, request);
}
