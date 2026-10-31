/* =====================================================================
   Greenwood High School — Navigation
   - Mobile nav toggle (aria-expanded)
   - Active link marking (per-page; also set in HTML via aria-current)
   - Close on outside click / Escape / link click
   ===================================================================== */

export function initNav() {
  const toggle = document.querySelector(".nav-toggle");
  const menu = document.getElementById("navLinks");

  if (!toggle || !menu) return;

  function isOpen() {
    return menu.classList.contains("is-open");
  }
  function setOpen(open) {
    menu.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("nav-open", open);
  }

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(!isOpen());
  });

  // Close when a link is clicked (mobile)
  menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) {
      setOpen(false);
      toggle.focus();
    }
  });

  // Close when clicking outside the nav (mobile only)
  document.addEventListener("click", (e) => {
    if (!isOpen()) return;
    if (e.target.closest(".site-header")) return;
    setOpen(false);
  });

  // Close if viewport widens past the mobile breakpoint
  const mq = window.matchMedia("(min-width: 881px)");
  mq.addEventListener?.("change", () => {
    if (mq.matches) setOpen(false);
  });
}
