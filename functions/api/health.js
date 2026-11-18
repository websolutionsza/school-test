/* =====================================================================
   TEMPORARY diagnostic — DELETE after we fix the database connection.
   GET /api/health → reports why the DB is unreachable, safely.
   Never returns credentials or the full connection string.
   ===================================================================== */

import { query, sqlEndpoint } from "../../lib/neon.js";

function maskHost(connectionString) {
  try {
    const url = new URL(connectionString);
    const labels = url.host.split(".");
    return "***." + labels.slice(1).join(".");
  } catch (e) {
    return null;
  }
}

export async function onRequestGet(context) {
  const env = context.env;
  const raw = env && env.NEON_DATABASE_URL ? String(env.NEON_DATABASE_URL) : "";

  const report = {
    variableSet: raw.length > 0,
    valueLength: raw.length,
    startsWithPostgresUrl:
      raw.startsWith("postgresql://") || raw.startsWith("postgres://"),
    endsWithSslmode: raw.includes("sslmode="),
    wrappedInQuotes: /^["']|["']$/.test(raw.trim()),
    edgeWhitespace: raw !== raw.trim(),
    hostMasked: null,
    parsesAsUrl: false,
    select1: null,
    error: null,
  };

  if (!report.variableSet) {
    report.error =
      "NEON_DATABASE_URL is not set — add it in Cloudflare (Production AND Preview tabs), then redeploy.";
    return Response.json(report, { headers: { "Cache-Control": "no-store" } });
  }

  report.hostMasked = maskHost(raw);

  try {
    new URL(raw.trim());
    report.parsesAsUrl = true;
  } catch (e) {
    report.error = "Value is not a valid URL — re-copy the connection string from Neon.";
  }

  try {
    sqlEndpoint(raw.trim());
  } catch (e) {
    report.error = report.error || "Value is not a usable postgresql:// connection string.";
  }

  if (report.wrappedInQuotes) {
    report.error = "Value is wrapped in quotes — paste the raw string only, no quotes.";
  }

  if (!report.parsesAsUrl) {
    return Response.json(report, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const rows = await query(env, "select 1 as ok");
    report.select1 =
      rows && rows[0] && rows[0].ok === 1
        ? "OK — database is reachable"
        : "unexpected response shape";
  } catch (err) {
    report.select1 = "failed";
    report.error = err.message || String(err);
  }

  return Response.json(report, { headers: { "Cache-Control": "no-store" } });
}
