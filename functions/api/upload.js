/* =====================================================================
   Cloudflare Pages Function — /api/upload
   ---------------------------------------------------------------------
   Proxies file uploads from the admin dashboard to PostFile.

   Security:
   - The PostFile API key (pf_…) is a SERVER-SIDE secret. It lives in
     the Cloudflare Pages environment variable POSTFILE_API_KEY and is
     NEVER sent to the browser.
   - The browser only ever sees /api/upload (same-origin) — no CORS,
     no key in JS.
   - This function does NOT authenticate the user. Authentication is
     enforced by the admin dashboard client (PostBase session +
     sessionStorage flag). Row-Level Security on the PostBase side is
     the real authority for what data the user can write.
   - To harden further, you can add referer / cookie checks here.

   Environment variables required:
     POSTFILE_API_KEY       e.g. pf_xxxxxxxxxxxxxxxxxxxxx
     POSTFILE_UPLOAD_URL    e.g. https://postfile.net/v1/upload
                              (optional — defaults to the URL below)

   Request:  POST /api/upload, multipart/form-data with field "file"
   Response: 200 OK with whatever JSON PostFile returned, or
             4xx/5xx with { error: "...", message: "..." }
   ===================================================================== */

const DEFAULT_POSTFILE_URL = "https://postfile.net/v1/upload";

const ALLOWED_MIME_PREFIXES = ["image/", "application/pdf"];
const ALLOWED_DOC_MIMES = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/rtf",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/zip",
  "application/x-zip-compressed",
];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

function isAllowedMime(mime) {
  if (!mime) return false;
  const m = mime.toLowerCase();
  if (ALLOWED_MIME_PREFIXES.some((p) => m.startsWith(p))) return true;
  if (ALLOWED_DOC_MIMES.includes(m)) return true;
  return false;
}

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!env || !env.POSTFILE_API_KEY) {
    return json({ error: "Upload service is not configured." }, 503);
  }
  const uploadUrl = env.POSTFILE_UPLOAD_URL || DEFAULT_POSTFILE_URL;

  let incomingForm;
  try {
    incomingForm = await request.formData();
  } catch (e) {
    return json({ error: "Invalid form data." }, 400);
  }

  const file = incomingForm.get("file");
  if (!file || typeof file === "string") {
    return json({ error: "No file provided." }, 400);
  }

  // Validate MIME (server-side; never trust the client accept attribute).
  if (!isAllowedMime(file.type)) {
    return json({ error: "File type not allowed." }, 415);
  }

  // Validate size.
  if (file.size > MAX_FILE_SIZE) {
    return json({ error: "File is too large (max 50 MB)." }, 413);
  }

  // Forward to PostFile. Use the original filename when available.
  const outgoingForm = new FormData();
  const safeName = (file.name || "upload").replace(/[^\w.\-]+/g, "_");
  outgoingForm.append("file", file, safeName);

  try {
    const postfileRes = await fetch(uploadUrl, {
      method: "POST",
      headers: { "X-API-Key": env.POSTFILE_API_KEY },
      body: outgoingForm,
    });

    const text = await postfileRes.text();
    return new Response(text, {
      status: postfileRes.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    // Never leak internal error details to the browser.
    return json({ error: "Upload proxy error." }, 502);
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
