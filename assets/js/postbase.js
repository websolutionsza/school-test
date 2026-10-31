/* =====================================================================
   Greenwood High School — PostBase client singleton
   ---------------------------------------------------------------------
   Wraps the PostBase SDK so callers don't have to import it directly or
   know where the config comes from. Config is loaded via /api/config
   (server-side env vars), never hardcoded.
   ===================================================================== */

import { createClient } from "https://cdn.jsdelivr.net/npm/postbasejs/+esm";
import { getConfig } from "./config.js";

let clientPromise = null;

/**
 * Returns a singleton PostBase client.
 * Resolves with the configured client. Rejects if config can't be loaded.
 */
export function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const config = await getConfig();
      return createClient(config.url, config.anonKey, {
        projectId: config.projectId,
      });
    })();
  }
  return clientPromise;
}

/**
 * Resets the cached client (used after logout so a new client is created
 * on next access).
 */
export function resetClient() {
  clientPromise = null;
}
