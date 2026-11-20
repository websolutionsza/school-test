/* =====================================================================
   Greenwood High School — Login lockout guard (server-side)
   ---------------------------------------------------------------------
   Enforces the 3-consecutive-failed-attempt rule for POST /api/auth/login:
   - Failures 1 and 2 return 401 as normal.
   - The 3rd failure inside the sliding window locks that client IP out
     of the login endpoint for LOCK_MS (30 seconds). Attempts made while
     locked are rejected immediately — even with the correct password —
     and are not counted as new failures.
   - A successful login, or the natural expiry of the lock, restores a
     fresh failure counter.

   Deliberate design choice (no silent behaviour): the state lives in
   Worker memory, NOT in the database. No existing table fits this data
   and the project rules forbid adding tables without sign-off. This
   means the lock is enforced server-side per Cloudflare isolate/PoP:
   refreshing, opening a new tab, or revisiting the login URL cannot
   bypass it (the server rejects the POST), but it is best-effort across
   edge locations and resets when an isolate is recycled. The existing
   8-failures-per-10-minute limiter and the WAF rule recommended in
   DEPLOYMENT.md remain the wider backstop.

   Pure module (no imports) so it can be unit-tested in isolation
   (scripts/test-login-guard.mjs).
   ===================================================================== */

export function createLoginGuard(options) {
  const opts = options || {};
  const THRESHOLD = opts.threshold || 3;
  const LOCK_MS = opts.lockMs || 30 * 1000;
  const WINDOW_MS = opts.windowMs || 10 * 60 * 1000;

  /* ip -> { count, firstAt } — consecutive failures inside WINDOW_MS */
  const failures = new Map();
  /* ip -> lockedUntil (epoch ms) */
  const locks = new Map();

  /** True while the IP is inside a lockout window. */
  function isLocked(ip, now) {
    const t = now === undefined ? Date.now() : now;
    const until = locks.get(ip);
    if (until === undefined) return false;
    if (t >= until) {
      // Lock expired — the failure counter was already reset on lock,
      // so the client gets a fresh set of attempts.
      locks.delete(ip);
      return false;
    }
    return true;
  }

  /**
   * Record one failed attempt. Returns { locked, attempts }:
   * locked=true means the caller must respond with the lockout
   * response (the lock was created by this call).
   */
  function registerFailure(ip, now) {
    const t = now === undefined ? Date.now() : now;
    const entry = failures.get(ip);
    if (!entry || t - entry.firstAt > WINDOW_MS) {
      failures.set(ip, { count: 1, firstAt: t });
      return { locked: false, attempts: 1 };
    }
    entry.count += 1;
    if (entry.count >= THRESHOLD) {
      locks.set(ip, t + LOCK_MS);
      failures.delete(ip); // counter resets — fresh attempts after the lock
      return { locked: true, attempts: entry.count };
    }
    return { locked: false, attempts: entry.count };
  }

  /** Clear all state for an IP (used on successful login). */
  function reset(ip) {
    failures.delete(ip);
    locks.delete(ip);
  }

  return { isLocked, registerFailure, reset, THRESHOLD, LOCK_MS };
}
