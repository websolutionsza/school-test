/* =====================================================================
   Greenwood High School — Same-origin API client
   ---------------------------------------------------------------------
   Replaces the old PostBase browser SDK. All database access now goes
   through this site's own Pages Functions (/api/...), which talk to
   Neon server-side. No database credentials exist in the browser.

   The session cookie is HttpOnly, so JavaScript never touches it —
   the browser attaches it automatically to same-origin requests.

   Error contract:
   - Server responses carry a safe, human-readable `error` message.
   - Network-level failures are rethrown untouched (their messages
     contain "Failed to fetch" / "Load failed"), which the admin pages
     use to switch into maintenance mode instead of looping on login.
   ===================================================================== */

async function request(path, options) {
  let response;
  try {
    response = await fetch(path, options);
  } catch (err) {
    throw err; // network failure — preserve original message
  }

  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    /* non-JSON response; handled below */
  }

  if (!response.ok) {
    const error = new Error(
      (data && data.error) || "Request failed (" + response.status + ")."
    );
    error.status = response.status;
    // Full parsed body (e.g. { locked: true } on login lockout) so
    // callers can branch on more than the status code. Read-only.
    error.data = data || null;
    throw error;
  }
  return data;
}

/**
 * GET a JSON endpoint. Returns the parsed body.
 */
export function apiGet(path) {
  return request(path, {
    headers: { Accept: "application/json" },
  });
}

/**
 * POST / PUT / DELETE a JSON endpoint.
 * Returns the parsed body.
 */
export function apiSend(method, path, body) {
  return request(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body || {}),
  });
}
