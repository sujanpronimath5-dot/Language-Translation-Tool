/* Landing page behaviour: theme toggle + scroll-reveal animations. */
(() => {
  "use strict";

  /* ------------------------------- Theme ------------------------------- */
  const themeBtn = document.getElementById("themeToggle");

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    if (themeBtn) themeBtn.textContent = theme === "dark" ? "☀️" : "🌙";
    try {
      localStorage.setItem("lingoflow-theme", theme);
    } catch { /* storage unavailable */ }
  }

  let saved = null;
  try {
    saved = localStorage.getItem("lingoflow-theme");
  } catch { /* ignore */ }
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));

  themeBtn?.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });

  /* --------------------------- Reveal on scroll ------------------------ */
  const revealables = document.querySelectorAll(".reveal");

  // Reveal whatever is already on screen immediately — this works even in
  // background/hidden windows where IntersectionObserver callbacks may not fire.
  function revealInView() {
    revealables.forEach((el) => {
      if (el.classList.contains("is-visible")) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) el.classList.add("is-visible");
    });
  }

  revealInView();
  window.addEventListener("load", revealInView);
  window.addEventListener("scroll", revealInView, { passive: true });
  window.addEventListener("resize", revealInView);

  // Let the observer handle everything below the fold while scrolling.
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    revealables.forEach((el) => observer.observe(el));
  } else {
    revealables.forEach((el) => el.classList.add("is-visible"));
  }
})();
