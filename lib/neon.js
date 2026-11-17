/* =====================================================================
   Greenwood High School — Neon HTTP SQL client
   ---------------------------------------------------------------------
   Talks to Neon over its HTTP "SQL over HTTP" endpoint using plain
   fetch(), with no npm dependency and no build step. The protocol is
   the same one used by @neondatabase/serverless (v1.x) in HTTP mode:

     POST https://api.<region-host>/sql
     Headers:
       Neon-Connection-String: <full connection string>
       Neon-Raw-Text-Output:   true
       Neon-Array-Mode:        true
     Body: { "query": "...", "params": [ ... ] }

     Response: { fields: [{ name, dataTypeID }, ...], rows: [[...], ...] }

   Values arrive as raw Postgres text; they are parsed here by column
   type (the same type OIDs Postgres wire protocol uses). Every call is
   parameterized ($1, $2, ...) — values are sent out-of-band in the JSON
   body, so SQL injection through user input is not possible.

   This module runs ONLY inside Cloudflare Pages Functions. The Neon
   connection string is a server-side environment variable
   (NEON_DATABASE_URL) and must never reach the browser.
   ===================================================================== */

const BOOL = 16;
const INT_TYPES = new Set([20, 21, 23, 26]); // int8, int2, int4, oid
const FLOAT_TYPES = new Set([700, 701, 1700]); // float4, float8, numeric
const TIMESTAMP_TYPES = new Set([1114, 1184]); // timestamp, timestamptz
const JSON_TYPES = new Set([114, 3802]); // json, jsonb

/* Postgres text timestamps look like "2026-11-16 19:21:33.123456+00".
   Convert to a proper ISO string so client-side new Date(...) parsing
   is reliable in every browser. */
export function toIsoTimestamp(text) {
  if (typeof text !== "string") return text;
  let s = text.trim().replace(" ", "T");
  if (/^[+\-]\d{2}$/.test(s.slice(-3))) s += ":00";
  const d = new Date(s);
  return isNaN(d.getTime()) ? text : d.toISOString();
}

function looksLikeTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)
  );
}

/* Deep-walk a parsed JSON structure and normalise any timestamp text
   that Postgres embedded (e.g. inside json_agg results). */
export function normalizeDates(value) {
  if (Array.isArray(value)) return value.map(normalizeDates);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) out[key] = normalizeDates(value[key]);
    return out;
  }
  if (looksLikeTimestamp(value)) return toIsoTimestamp(value);
  return value;
}

function parseValue(oid, raw) {
  if (raw === null || raw === undefined) return null;
  if (oid === BOOL) return raw === "t" || raw === true;
  if (INT_TYPES.has(oid)) return Number(raw);
  if (FLOAT_TYPES.has(oid)) return Number(raw);
  if (TIMESTAMP_TYPES.has(oid)) return toIsoTimestamp(raw);
  if (JSON_TYPES.has(oid)) {
    try {
      return normalizeDates(JSON.parse(raw));
    } catch (e) {
      return raw;
    }
  }
  return raw;
}

/* Derive the HTTP endpoint from the connection string, mirroring the
   official driver: replace the first hostname label with "api.".
   e.g. ep-cool-name-123.eu-central-1.aws.neon.tech
        -> https://api.eu-central-1.aws.neon.tech/sql            */
export function sqlEndpoint(connectionString) {
  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch (e) {
    throw new Error("NEON_DATABASE_URL is not a valid connection string.");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("NEON_DATABASE_URL must be a postgresql:// URL.");
  }
  if (!parsed.host) {
    throw new Error("NEON_DATABASE_URL is missing its host.");
  }
  const host = parsed.host.replace(/^[^.]+\./, "api.");
  return "https://" + host + "/sql";
}

/**
 * Run one parameterized statement against Neon.
 * Returns an array of row objects with values parsed by column type.
 * Throws an Error with a safe `.message` (never containing credentials).
 */
export async function query(env, sqlText, params = []) {
  const connectionString = env && env.NEON_DATABASE_URL;
  if (!connectionString) {
    const err = new Error("Database is not configured on the server.");
    err.status = 503;
    throw err;
  }

  let response;
  try {
    response = await fetch(sqlEndpoint(connectionString), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Neon-Connection-String": connectionString,
        "Neon-Raw-Text-Output": "true",
        "Neon-Array-Mode": "true",
      },
      body: JSON.stringify({ query: sqlText, params: params.map(toParam) }),
    });
  } catch (e) {
    const err = new Error("Could not reach the database service.");
    err.status = 502;
    err.cause = e;
    throw err;
  }

  if (!response.ok) {
    let message = "The database returned an error.";
    try {
      const body = await response.json();
      if (body && typeof body.message === "string") message = body.message;
    } catch (e) {
      /* keep the generic message */
    }
    const err = new Error(message);
    err.status = 502;
    throw err;
  }

  const data = await response.json();
  const fields = Array.isArray(data.fields) ? data.fields : [];
  const names = fields.map((f) => f.name);
  const oids = fields.map((f) => f.dataTypeID);
  const rows = Array.isArray(data.rows) ? data.rows : [];

  return rows.map((row) =>
    Object.fromEntries(row.map((value, i) => [names[i], parseValue(oids[i], value)]))
  );
}

/* Match the official driver's value preparation: JSON-encodable
   primitives only; undefined becomes null. */
function toParam(value) {
  if (value === undefined) return null;
  return value;
}
