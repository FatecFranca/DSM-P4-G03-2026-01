// Interações leves e dinâmicas sem alterar conteúdo/estrutura
(() => {
  function safeQuery(selector) {
    try {
      return document.querySelectorAll(selector) || [];
    } catch (e) {
      return [];
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const reduceMotionQuery = window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    const narrowScreenQuery = window.matchMedia
      ? window.matchMedia("(max-width: 1024px)")
      : null;

    if (reduceMotionQuery?.matches) {
      return;
    }

    const selectors = [
      ".hero-titulo",
      ".hero-subtitulo",
      ".hero-ctas",
      ".hero-qr",
      ".hero-media img",
      ".hero-time-inner",
      ".team-card",
      ".team-item",
      ".contact-cta",
      ".contact-note",
      ".funciona-etapa",
      ".sobre-texto",
      ".sobre-imagem",
      ".footer-inner",
    ];

    for (const sel of selectors) {
      for (const el of safeQuery(sel)) {
        el.classList.add("reveal");
      }
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("show");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12 },
    );

    for (const el of safeQuery(".reveal")) {
      io.observe(el);
    }

    const header = document.querySelector(".site-header");
    const menuToggle = document.querySelector(".menu-toggle");
    const mainNav = document.querySelector(".main-nav");
    const navLinks = Array.prototype.slice.call(
      document.querySelectorAll(".main-nav a"),
    );

    function closeMenu() {
      if (!header || !menuToggle) return;
      header.classList.remove("menu-open");
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "Abrir menu de navegação");
    }

    if (menuToggle && mainNav) {
      menuToggle.addEventListener("click", () => {
        const isOpen = header.classList.toggle("menu-open");
        menuToggle.setAttribute("aria-expanded", String(isOpen));
        menuToggle.setAttribute(
          "aria-label",
          isOpen ? "Fechar menu de navegação" : "Abrir menu de navegação",
        );
      });
      for (const link of navLinks) {
        link.addEventListener("click", closeMenu);
      }
    }

    function onScrollHeader() {
      if (!header) return;
      if (window.scrollY > 40) header.classList.add("scrolled");
      else header.classList.remove("scrolled");
    }
    window.addEventListener("scroll", onScrollHeader, { passive: true });
    onScrollHeader();

    const sections = Array.prototype.slice.call(
      document.querySelectorAll("main section[id]"),
    );
    function updateActiveNav() {
      if (!sections.length) return;
      let current = sections[0];
      const scrollAnchor = window.scrollY + 140;
      for (let i = 0; i < sections.length; i++) {
        if (sections[i].offsetTop <= scrollAnchor) current = sections[i];
      }
      const atPageBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 8;
      if (atPageBottom) current = sections[sections.length - 1];
      for (const a of navLinks) {
        a.classList.remove("active");
      }
      const active = document.querySelector(
        `.main-nav a[href="#${current?.id}"]`,
      );
      if (active) active.classList.add("active");
    }
    window.addEventListener("scroll", updateActiveNav, { passive: true });
    updateActiveNav();

    const heroMedia = document.querySelector(".hero-media");
    function onParallax() {
      if (!heroMedia) return;
      if (narrowScreenQuery?.matches) {
        heroMedia.style.transform = "";
        return;
      }
      const rect = heroMedia.getBoundingClientRect();
      const pct =
        (window.innerHeight - rect.top) / (window.innerHeight + rect.height);
      const shift = Math.max(Math.min((pct - 0.5) * 14, 12), -12);
      heroMedia.style.transform = `translateY(${Math.round(shift)}px)`;
    }
    window.addEventListener("scroll", onParallax, { passive: true });
    onParallax();
  });
})();
