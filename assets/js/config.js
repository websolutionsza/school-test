/* =====================================================================
   Greenwood High School — Runtime configuration loader
   ---------------------------------------------------------------------
   Purpose:
   - The PostBase *anon* key is intentionally NOT hardcoded in JS.
   - It is fetched at runtime from /api/config, which is a Cloudflare
     Pages Function that reads it from the server-side environment.
   - This keeps secrets out of the source code and out of git history.

   Note on security:
   - PostBase anon keys (pb_anon_…) are designed to be safely exposed to
     browsers, exactly like Supabase anon keys. The real protection is
     Row-Level Security on the PostBase backend.
   - /api/config simply returns the anon key + URL + project ID; it does
     NOT return any service-role keys.
   - The PostFile API key (pf_…) is a true server secret. It is only
     used inside /api/upload (a Pages Function) and never leaves the
     server.
   ===================================================================== */

const CACHE_KEY = "ghs:runtime-config";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CONFIG_ENDPOINT = "/api/config";

let cachedConfig = null;
let inFlight = null;

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.t || !parsed.c) return null;
    if (Date.now() - parsed.t > CACHE_TTL) return null;
    return parsed.c;
  } catch (e) {
    return null;
  }
}

function writeCache(config) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ c: config, t: Date.now() })
    );
  } catch (e) {
    /* localStorage might be unavailable; safe to ignore */
  }
}

/**
 * Returns the runtime configuration for PostBase.
 * Shape: { url, anonKey, projectId }
 *
 * @returns {Promise<{url:string, anonKey:string, projectId:string}>}
 */
export async function getConfig() {
  if (cachedConfig) return cachedConfig;

  const fromCache = readCache();
  if (fromCache) {
    cachedConfig = fromCache;
    return cachedConfig;
  }

  if (!inFlight) {
    inFlight = fetch(CONFIG_ENDPOINT, {
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Config endpoint returned ${res.status}`);
        }
        const data = await res.json();
        if (!data || !data.url || !data.anonKey || !data.projectId) {
          throw new Error("Config endpoint returned incomplete payload");
        }
        cachedConfig = data;
        writeCache(data);
        inFlight = null;
        return data;
      })
      .catch((err) => {
        inFlight = null;
        throw err;
      });
  }

  return inFlight;
}

/**
 * Eagerly preload the config (no awaiting). Useful at the top of a page
 * so the network request starts as early as possible.
 */
export function preloadConfig() {
  getConfig().catch(() => {
    /* errors are handled by the callers that await getConfig() */
  });
}
