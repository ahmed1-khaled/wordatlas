(() => {
  "use strict";
  const body = document.body;
  const progress = document.querySelector("#readingProgressBar");
  const themeButton = document.querySelector("#themeToggle");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const savedTheme = (() => {
    try { return localStorage.getItem("wordatlas-theme") || "light"; }
    catch { return "light"; }
  })();
  body.dataset.theme = savedTheme;

  themeButton?.addEventListener("click", () => {
    const next = body.dataset.theme === "dark" ? "light" : "dark";
    body.dataset.theme = next;
    try { localStorage.setItem("wordatlas-theme", next); } catch { /* storage can be disabled */ }
    themeButton.setAttribute("aria-label", next === "dark" ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن");
  });

  let scheduled = false;
  function updateProgress() {
    if (!progress) return;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
    progress.style.width = Math.min(100, Math.max(0, ratio * 100)) + "%";
    scheduled = false;
  }
  window.addEventListener("scroll", () => {
    if (!scheduled) {
      window.requestAnimationFrame(updateProgress);
      scheduled = true;
    }
  }, { passive: true });
  updateProgress();

  if (!reducedMotion && "IntersectionObserver" in window) {
    const targets = document.querySelectorAll(".metrics, .section-heading, .sidebar, .dictionary-panel, .detail-panel, .about-section, .footer");
    targets.forEach((element) => element.classList.add("reveal-on-scroll"));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -35px 0px" });
    targets.forEach((element) => observer.observe(element));
  }

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", () => {
      const id = link.getAttribute("href");
      if (id && id.length > 1) {
        const target = document.querySelector(id);
        target?.classList.add("nav-highlight");
        window.setTimeout(() => target?.classList.remove("nav-highlight"), 800);
      }
    });
  });
})();
