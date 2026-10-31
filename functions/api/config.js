/* =====================================================================
   Cloudflare Pages Function — /api/config
   ---------------------------------------------------------------------
   Returns the PostBase *anon* configuration to the browser at runtime.

   Why this exists:
   - The PostBase anon key (pb_anon_…) is designed to be exposed to
     browsers, exactly like a Supabase anon key. Security comes from
     Row-Level Security policies on the PostBase backend.
   - However, we still want it OUT of the source code and OUT of git
     history. So we store it as a Cloudflare Pages environment variable
     and serve it to the browser via this endpoint.

   What it does NOT return:
   - Service-role keys, secret keys, or the PostFile API key. Those are
     never sent to the browser under any circumstance.

   Environment variables required (set in Cloudflare Pages dashboard
   OR via wrangler secrets):
     POSTBASE_URL         e.g. https://postbase-production-b4c8.up.railway.app
     POSTBASE_ANON_KEY    e.g. pb_anon_xxxxxxxxxxxxxxxx
     POSTBASE_PROJECT_ID  e.g. ea6357bc-c34f-4dc2-b0ef-470facb6d9bb

   Request method: GET
   Response: 200 OK, Content-Type: application/json
            { "url": "...", "anonKey": "...", "projectId": "..." }
   ===================================================================== */

const REQUIRED = ["POSTBASE_URL", "POSTBASE_ANON_KEY", "POSTBASE_PROJECT_ID"];

export async function onRequestGet(context) {
  const { env } = context;

  // Validate that every required variable is present.
  const missing = REQUIRED.filter((k) => !env || !env[k]);
  if (missing.length > 0) {
    // Deliberately vague — do not leak which vars are missing.
    return new Response(
      JSON.stringify({ error: "Server configuration incomplete." }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const payload = {
    url: env.POSTBASE_URL,
    anonKey: env.POSTBASE_ANON_KEY,
    projectId: env.POSTBASE_PROJECT_ID,
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Allow short caching so the client doesn't re-fetch on every page
      // navigation; the client also caches in localStorage for 5 minutes.
      "Cache-Control": "public, max-age=60",
    },
  });
}
