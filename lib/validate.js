/* =====================================================================
   Greenwood High School — Input validation (server-side)
   ---------------------------------------------------------------------
   Every write endpoint validates its payload here before any SQL runs.
   The client also validates, but the server never trusts the client.
   ===================================================================== */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FILE_TYPE_VALUES = new Set(["image", "pdf", "document"]);

/* Uploaded files live on PostFile; only HTTPS URLs from those hosts are
   accepted as attachment records. */
const FILE_HOST_ALLOWLIST = new Set([
  "cdn.postfile.download",
  "postfile.net",
]);

export function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

export function limitParam(value, fallback, max = 100) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

/**
 * Validate an announcement/post payload.
 * Returns { ok: true, value } or { ok: false, error }.
 */
export function validateItemInput(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid request body." };
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const published = body.published === undefined ? true : body.published === true;

  if (title.length < 1) {
    return { ok: false, error: "Title is required." };
  }
  if (title.length > 200) {
    return { ok: false, error: "Title must be 200 characters or fewer." };
  }
  if (content.length < 1) {
    return { ok: false, error: "Content is required." };
  }
  if (content.length > 20000) {
    return { ok: false, error: "Content must be 20,000 characters or fewer." };
  }

  const media = validateMediaPayload(body.media);
  if (!media.ok) return media;

  return {
    ok: true,
    value: { title, content, published, media: media.value },
  };
}

/**
 * Validate the media payload: { add: [{file_url, file_type}], remove: [uuid] }
 * Both keys are optional; unknown entries are rejected, not ignored.
 */
export function validateMediaPayload(media) {
  const result = { add: [], remove: [] };
  if (media === undefined || media === null) {
    return { ok: true, value: result };
  }
  if (typeof media !== "object" || Array.isArray(media)) {
    return { ok: false, error: "Invalid media payload." };
  }

  if (media.add !== undefined && media.add !== null) {
    if (!Array.isArray(media.add) || media.add.length > 10) {
      return { ok: false, error: "You can attach up to 10 files." };
    }
    for (const item of media.add) {
      if (!item || typeof item !== "object") {
        return { ok: false, error: "Invalid attachment entry." };
      }
      const url = typeof item.file_url === "string" ? item.file_url.trim() : "";
      const type = typeof item.file_type === "string" ? item.file_type : "";
      if (!url || !FILE_TYPE_VALUES.has(type)) {
        return { ok: false, error: "Invalid attachment entry." };
      }
      let parsed;
      try {
        parsed = new URL(url);
      } catch (e) {
        return { ok: false, error: "Invalid attachment URL." };
      }
      if (parsed.protocol !== "https:" || !FILE_HOST_ALLOWLIST.has(parsed.hostname)) {
        return { ok: false, error: "Attachments must be hosted on the school's file service." };
      }
      result.add.push({ file_url: url, file_type: type });
    }
  }

  if (media.remove !== undefined && media.remove !== null) {
    if (!Array.isArray(media.remove) || media.remove.length > 50) {
      return { ok: false, error: "Invalid attachment removal list." };
    }
    for (const id of media.remove) {
      if (!isUuid(id)) {
        return { ok: false, error: "Invalid attachment reference." };
      }
      result.remove.push(id);
    }
  }

  return { ok: true, value: result };
}
