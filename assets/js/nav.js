/* =====================================================================
   Greenwood High School — Navigation (self-executing, no module)
   ---------------------------------------------------------------------
   Rewritten as a plain deferred script (NOT an ES module) so the
   hamburger menu works even if module loading fails (e.g. file://
   protocol, CDN blocked, JS parse error in another module).

   Loaded via:  <script src="assets/js/nav.js" defer></script>
   ===================================================================== */

(function () {
  function initNav() {
    var toggle = document.querySelector(".nav-toggle");
    var menu = document.getElementById("navLinks");
    if (!toggle || !menu) return;

    function isOpen() {
      return menu.classList.contains("is-open");
    }

    function setOpen(open) {
      menu.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }

    // Toggle on click
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      setOpen(!isOpen());
    });

    // Close when a link is clicked (mobile)
    var links = menu.querySelectorAll("a");
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener("click", function () {
        setOpen(false);
      });
    }

    // Close on Escape
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen()) {
        setOpen(false);
        toggle.focus();
      }
    });

    // Close when clicking outside the nav (mobile only)
    document.addEventListener("click", function (e) {
      if (!isOpen()) return;
      if (e.target.closest && e.target.closest(".site-header")) return;
      setOpen(false);
    });

    // Close if viewport widens past the mobile breakpoint
    var mq = window.matchMedia("(min-width: 881px)");
    if (mq.addEventListener) {
      mq.addEventListener("change", function () {
        if (mq.matches) setOpen(false);
      });
    } else if (mq.addListener) {
      mq.addListener(function () {
        if (mq.matches) setOpen(false);
      });
    }
  }

  // Run immediately if DOM is already parsed, otherwise wait
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNav);
  } else {
    initNav();
  }
})();
