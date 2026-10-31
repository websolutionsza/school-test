/* =====================================================================
   Greenwood High School — Admin login
   ---------------------------------------------------------------------
   - Uses the shared PostBase client (config from /api/config).
   - Per-tab sessionStorage flag prevents trivial direct navigation to
     administration.html, but the real authority is the PostBase session.
   - Shows polite error messages; never echoes raw backend errors that
     could leak account state.
   ===================================================================== */

import { getClient } from "./postbase.js";
import { $, showToast } from "./utils.js";

const SESSION_FLAG = "admin_tab_authenticated";

function showMessage(text, type) {
  const box = $("#messageBox");
  if (!box) return;
  const icon =
    type === "error"
      ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
  box.innerHTML = icon + "<span>" + text + "</span>";
  box.className = "auth-message is-show is-" + type;
}

function hideMessage() {
  const box = $("#messageBox");
  if (!box) return;
  box.className = "auth-message";
  box.innerHTML = "";
}

function setBusy(busy) {
  const btn = $("#loginBtn");
  const email = $("#email");
  const password = $("#password");
  const toggle = $("#togglePassword");
  if (!btn) return;
  btn.disabled = busy;
  email.disabled = busy;
  password.disabled = busy;
  if (toggle) toggle.disabled = busy;
  btn.innerHTML = busy
    ? '<span class="spinner"></span> Signing in…'
    : "Sign In";
}

export function initAdminLogin() {
  const form = $("#loginForm");
  if (!form) return;

  // Password visibility toggle (UI only)
  const toggle = $("#togglePassword");
  const eyeOpen = $("#eyeOpen");
  const eyeClosed = $("#eyeClosed");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const pw = $("#password");
      const isPw = pw.getAttribute("type") === "password";
      pw.setAttribute("type", isPw ? "text" : "password");
      if (eyeOpen) eyeOpen.style.display = isPw ? "none" : "block";
      if (eyeClosed) eyeClosed.style.display = isPw ? "block" : "none";
    });
  }

  // If already authenticated in this tab AND session still valid,
  // skip the form. Otherwise always show the form.
  (async function checkSession() {
    const tabAuthed =
      sessionStorage.getItem(SESSION_FLAG) === "true";
    if (!tabAuthed) return;
    try {
      const postbase = await getClient();
      const { data } = await postbase.auth.getSession();
      if (data && data.session) {
        window.location.replace("administration.html");
      } else {
        sessionStorage.removeItem(SESSION_FLAG);
      }
    } catch (e) {
      // If config/session can't be loaded, leave the form visible
      sessionStorage.removeItem(SESSION_FLAG);
    }
  })();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage();

    const email = $("#email").value.trim();
    const password = $("#password").value;
    if (!email || !password) {
      showMessage("Please enter both your email and password.", "error");
      return;
    }

    setBusy(true);
    try {
      const postbase = await getClient();
      const { data, error } = await postbase.auth.signInWithPassword({
        email,
        password,
        rememberMe: true,
      });

      if (error) {
        setBusy(false);
        const msg = (error.message || "").toLowerCase();
        if (
          msg.includes("invalid") ||
          msg.includes("credentials") ||
          msg.includes("password")
        ) {
          showMessage("Incorrect email or password. Please try again.", "error");
        } else if (msg.includes("not found") || msg.includes("no user")) {
          showMessage("No account found with that email address.", "error");
        } else if (msg.includes("rate") || msg.includes("many")) {
          showMessage("Too many attempts. Please wait a moment and try again.", "error");
        } else {
          showMessage("Sign-in failed. Please try again.", "error");
        }
        return;
      }

      sessionStorage.setItem(SESSION_FLAG, "true");
      showMessage("Login successful. Redirecting…", "success");
      window.location.replace("administration.html");
    } catch (err) {
      setBusy(false);
      console.error("Login error:", err);
      showMessage("Could not reach the authentication service. Please try again.", "error");
    }
  });

  // Hide error message as the user types
  ["#email", "#password"].forEach((sel) => {
    const el = $(sel);
    if (el) el.addEventListener("input", hideMessage);
  });
}
