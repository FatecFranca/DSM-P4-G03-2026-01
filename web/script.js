// Interações leves e dinâmicas sem alterar conteúdo/estrutura
(function () {
  function safeQuery(selector) {
    try {
      return document.querySelectorAll(selector) || [];
    } catch (e) {
      return [];
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var reduceMotionQuery = window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    var narrowScreenQuery = window.matchMedia
      ? window.matchMedia("(max-width: 1024px)")
      : null;

    if (reduceMotionQuery && reduceMotionQuery.matches) {
      return;
    }

    var selectors = [
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

    selectors.forEach(function (sel) {
      Array.prototype.forEach.call(safeQuery(sel), function (el) {
        el.classList.add("reveal");
      });
    });

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("show");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );

    Array.prototype.forEach.call(safeQuery(".reveal"), function (el) {
      io.observe(el);
    });

    var header = document.querySelector(".site-header");
    var menuToggle = document.querySelector(".menu-toggle");
    var mainNav = document.querySelector(".main-nav");
    var navLinks = Array.prototype.slice.call(
      document.querySelectorAll(".main-nav a"),
    );

    function closeMenu() {
      if (!header || !menuToggle) return;
      header.classList.remove("menu-open");
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "Abrir menu de navegação");
    }

    if (menuToggle && mainNav) {
      menuToggle.addEventListener("click", function () {
        var isOpen = header.classList.toggle("menu-open");
        menuToggle.setAttribute("aria-expanded", String(isOpen));
        menuToggle.setAttribute(
          "aria-label",
          isOpen ? "Fechar menu de navegação" : "Abrir menu de navegação",
        );
      });
      navLinks.forEach(function (link) {
        link.addEventListener("click", closeMenu);
      });
    }

    function onScrollHeader() {
      if (!header) return;
      if (window.scrollY > 40) header.classList.add("scrolled");
      else header.classList.remove("scrolled");
    }
    window.addEventListener("scroll", onScrollHeader, { passive: true });
    onScrollHeader();

    var sections = Array.prototype.slice.call(
      document.querySelectorAll("main section[id]"),
    );
    function updateActiveNav() {
      if (!sections.length) return;
      var current = sections[0];
      var scrollAnchor = window.scrollY + 140;
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].offsetTop <= scrollAnchor) current = sections[i];
      }
      var atPageBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 8;
      if (atPageBottom) current = sections[sections.length - 1];
      navLinks.forEach(function (a) {
        a.classList.remove("active");
      });
      var active = document.querySelector(
        '.main-nav a[href="#' + (current && current.id) + '"]',
      );
      if (active) active.classList.add("active");
    }
    window.addEventListener("scroll", updateActiveNav, { passive: true });
    updateActiveNav();

    var heroMedia = document.querySelector(".hero-media");
    function onParallax() {
      if (!heroMedia) return;
      if (narrowScreenQuery && narrowScreenQuery.matches) {
        heroMedia.style.transform = "";
        return;
      }
      var rect = heroMedia.getBoundingClientRect();
      var pct =
        (window.innerHeight - rect.top) / (window.innerHeight + rect.height);
      var shift = Math.max(Math.min((pct - 0.5) * 14, 12), -12);
      heroMedia.style.transform = "translateY(" + Math.round(shift) + "px)";
    }
    window.addEventListener("scroll", onParallax, { passive: true });
    onParallax();
  });
})();
