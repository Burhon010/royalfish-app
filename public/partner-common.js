(function () {
  "use strict";

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  var header = document.getElementById("siteHeader");
  if (header) {
    var onScroll = function () {
      if (window.scrollY > 12) header.classList.add("is-scrolled");
      else header.classList.remove("is-scrolled");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  var burger = document.getElementById("burgerBtn");
  var mobileNav = document.getElementById("mobileNav");
  if (burger && mobileNav) {
    var close = function () {
      mobileNav.classList.remove("is-open");
      burger.setAttribute("aria-expanded", "false");
      header.classList.remove("nav-open");
      document.body.classList.remove("nav-open");
    };
    burger.addEventListener("click", function () {
      if (mobileNav.classList.contains("is-open")) {
        close();
      } else {
        mobileNav.classList.add("is-open");
        burger.setAttribute("aria-expanded", "true");
        header.classList.add("nav-open");
        document.body.classList.add("nav-open");
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
    mobileNav.querySelectorAll(".mobile-link").forEach(function (l) {
      l.addEventListener("click", close);
    });
  }

  // кнопки "Показать / Скрыть" у полей пароля
  document.querySelectorAll(".pw-toggle-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var input = document.getElementById(btn.getAttribute("data-target"));
      if (!input) return;
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Скрыть" : "Показать";
      input.focus();
    });
  });
})();
