(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var CATEGORY_LABELS = {
    fish: "Рыба",
    shrimp: "Креветки",
    squid: "Кальмары",
    caviar: "Икра",
    delicacy: "Морские деликатесы",
    lobster: "Лобстеры",
    other: "Другие",
  };

  /* ---------------------------------------------------------
     Year in footer
     --------------------------------------------------------- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------------------------------------------------------
     Header scroll state
     --------------------------------------------------------- */
  var header = document.getElementById("siteHeader");
  function onScrollHeader() {
    if (window.scrollY > 12) header.classList.add("is-scrolled");
    else header.classList.remove("is-scrolled");
  }
  onScrollHeader();
  window.addEventListener("scroll", onScrollHeader, { passive: true });

  /* ---------------------------------------------------------
     Mobile menu
     --------------------------------------------------------- */
  var burger = document.getElementById("burgerBtn");
  var mobileNav = document.getElementById("mobileNav");

  function closeMobileNav() {
    mobileNav.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
    header.classList.remove("nav-open");
    document.body.classList.remove("nav-open");
  }
  function openMobileNav() {
    mobileNav.classList.add("is-open");
    burger.setAttribute("aria-expanded", "true");
    header.classList.add("nav-open");
    document.body.classList.add("nav-open");
  }
  burger.addEventListener("click", function () {
    if (mobileNav.classList.contains("is-open")) closeMobileNav();
    else openMobileNav();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMobileNav();
  });
  mobileNav.querySelectorAll(".mobile-link").forEach(function (link) {
    link.addEventListener("click", closeMobileNav);
  });

  /* ---------------------------------------------------------
     Active nav link on scroll
     --------------------------------------------------------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".main-nav .nav-link"));
  var sections = ["top", "catalog", "about", "contacts"]
    .map(function (id) { return document.getElementById(id); })
    .filter(Boolean);

  function updateActiveNav() {
    var pos = window.scrollY + window.innerHeight * 0.35;
    var currentId = sections[0] && sections[0].id;
    sections.forEach(function (sec) {
      if (sec.offsetTop <= pos) currentId = sec.id;
    });
    navLinks.forEach(function (link) {
      var href = link.getAttribute("href").replace("#", "");
      link.classList.toggle("is-active", href === currentId);
    });
  }
  updateActiveNav();
  window.addEventListener("scroll", updateActiveNav, { passive: true });

  /* ---------------------------------------------------------
     Catalog: загрузка товаров из API и рендер карточек
     --------------------------------------------------------- */
  var productGrid = document.getElementById("productGrid");
  var emptyState = document.getElementById("emptyState");
  var pills = Array.prototype.slice.call(document.querySelectorAll(".filter-pill"));
  var searchInput = document.getElementById("catalogSearch");
  var searchClearBtn = document.getElementById("searchClear");
  var activeFilter = "all";
  var searchQuery = "";
  var revealObserver = null;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatPrice(n) {
    var num = Number(n);
    if (Number.isInteger(num)) return String(num);
    return num.toFixed(2).replace(".", ",");
  }

  // Оптимизация изображений из Cloudinary через URL-transformations —
  // исходники в Cloudinary не трогаем, просто просим отдать версию
  // поменьше/полегче под конкретное место показа:
  //   f_auto — автоформат (WebP/AVIF там, где браузер поддерживает)
  //   q_auto — автоподбор качества (заметной потери для глаза нет)
  //   w_N    — ширина под реальный размер превью на странице
  // Для не-Cloudinary ссылок (демо-товары с Unsplash и т.п.) возвращаем
  // URL как есть — трогать чужие домены не нужно и незачем.
  function optimizeCloudinaryUrl(url, width) {
    if (!url || typeof url !== "string") return url;
    if (url.indexOf("res.cloudinary.com") === -1 || url.indexOf("/upload/") === -1) return url;
    return url.replace("/upload/", "/upload/f_auto,q_auto,w_" + width + "/");
  }

  function buildCard(p) {
    var article = document.createElement("article");
    article.className = "card" + (p.inStock ? "" : " is-out");
    article.setAttribute("data-cat", p.category);
    article.setAttribute("data-id", p.id);
    article.setAttribute("data-name", String(p.name || "").toLowerCase());

    var badges = "";
    if (p.isNew) badges += '<span class="tag tag--new">Новинка</span>';
    if (p.discountPercent > 0) badges += '<span class="tag tag--sale">\u2212' + p.discountPercent + "%</span>";

    var mediaInner = p.image
      ? '<img src="' + escapeHtml(optimizeCloudinaryUrl(p.image, 700)) + '" alt="' + escapeHtml(p.name) + '" loading="lazy" width="900" height="700">'
      : '<div class="no-image">Фото скоро появится</div>';

    var priceRow = "";
    if (p.discountPercent > 0) {
      priceRow += '<span class="price-old">' + formatPrice(p.price) + " сомони</span>";
    }
    priceRow += '<span class="price">' + formatPrice(p.finalPrice) + " сомони</span>";

    article.innerHTML =
      '<div class="card-media">' +
        mediaInner +
        (badges ? '<div class="tag-stack">' + badges + "</div>" : "") +
        '<span class="status-chip ' + (p.inStock ? "status-in" : "status-out") + '">' +
          (p.inStock ? "В наличии" : "Нет в наличии") +
        "</span>" +
      "</div>" +
      '<div class="card-body">' +
        '<h3 class="card-name">' + escapeHtml(p.name) + "</h3>" +
        '<p class="card-weight">' + escapeHtml(p.weight) + "</p>" +
        '<div class="card-price-row">' + priceRow + "</div>" +
        '<div class="card-cart-row">' +
          '<div class="qty-stepper" data-role="qty">' +
            '<button type="button" class="qty-btn" data-action="dec" aria-label="Уменьшить количество">&minus;</button>' +
            '<span class="qty-value">1</span>' +
            '<button type="button" class="qty-btn" data-action="inc" aria-label="Увеличить количество">+</button>' +
          '</div>' +
          '<button type="button" class="btn-add-cart"' + (p.inStock ? "" : " disabled") + '>' +
            (p.inStock ? "В корзину" : "Нет в наличии") +
          "</button>" +
        "</div>" +
      "</div>";

    if (p.inStock) {
      var qtyValueEl = article.querySelector(".qty-value");
      var decBtn = article.querySelector('[data-action="dec"]');
      var incBtn = article.querySelector('[data-action="inc"]');
      var addBtn = article.querySelector(".btn-add-cart");

      decBtn.addEventListener("click", function () {
        var v = Math.max(1, Number(qtyValueEl.textContent) - 1);
        qtyValueEl.textContent = String(v);
      });
      incBtn.addEventListener("click", function () {
        var v = Math.min(99, Number(qtyValueEl.textContent) + 1);
        qtyValueEl.textContent = String(v);
      });
      addBtn.addEventListener("click", function () {
        var qty = Number(qtyValueEl.textContent) || 1;
        addToCart(p.id, qty);
        qtyValueEl.textContent = "1";
        flashAddedToCart(addBtn);
      });
    }

    return article;
  }

  function applyFilter() {
    var cards = Array.prototype.slice.call(productGrid.querySelectorAll(".card"));
    var visibleCount = 0;
    var query = searchQuery.trim().toLowerCase();

    cards.forEach(function (card) {
      var matchesCategory = activeFilter === "all" || card.getAttribute("data-cat") === activeFilter;
      var matchesSearch = !query || card.getAttribute("data-name").indexOf(query) !== -1;
      var match = matchesCategory && matchesSearch;
      card.classList.toggle("is-filtered-out", !match);
      if (match) visibleCount++;
    });

    emptyState.hidden = visibleCount !== 0 || cards.length === 0;
  }

  function initReveal(cards) {
    if ("IntersectionObserver" in window && !reduceMotion) {
      if (revealObserver) revealObserver.disconnect();
      revealObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
      );
      cards.forEach(function (card) { revealObserver.observe(card); });
    } else {
      cards.forEach(function (card) { card.classList.add("is-visible"); });
    }
  }

  function renderProducts(products) {
    productGrid.innerHTML = "";
    productsById = {};
    products.forEach(function (p) { productsById[p.id] = p; });

    if (!products.length) {
      var msg = document.createElement("p");
      msg.className = "catalog-status";
      msg.textContent = "Каталог скоро пополнится товарами.";
      productGrid.appendChild(msg);
      emptyState.hidden = true;
      return;
    }

    var fragment = document.createDocumentFragment();
    var cards = [];
    products.forEach(function (p) {
      var card = buildCard(p);
      fragment.appendChild(card);
      cards.push(card);
    });
    productGrid.appendChild(fragment);

    applyFilter();
    initReveal(cards);
    renderCartItems(); // на случай, если корзина уже открыта и товары дозагрузились
  }

  function renderError() {
    productGrid.innerHTML = '<p class="catalog-status is-error">Не удалось загрузить каталог. Попробуйте обновить страницу.</p>';
    emptyState.hidden = true;
  }

  pills.forEach(function (pill) {
    pill.addEventListener("click", function () {
      pills.forEach(function (p) {
        p.classList.remove("is-active");
        p.setAttribute("aria-selected", "false");
      });
      pill.classList.add("is-active");
      pill.setAttribute("aria-selected", "true");
      activeFilter = pill.getAttribute("data-filter");
      applyFilter();
    });
  });

  if (searchInput) {
    var runSearch = debounce(function () {
      searchQuery = searchInput.value;
      if (searchClearBtn) searchClearBtn.hidden = !searchQuery;
      applyFilter();
    }, 150);

    searchInput.addEventListener("input", runSearch);
    searchInput.addEventListener("search", runSearch); // клик по крестику самого input[type=search]

    if (searchClearBtn) {
      searchClearBtn.addEventListener("click", function () {
        searchInput.value = "";
        searchQuery = "";
        searchClearBtn.hidden = true;
        applyFilter();
        searchInput.focus();
      });
    }
  }

  fetch("/api/products")
    .then(function (res) {
      if (!res.ok) throw new Error("Ошибка сети");
      return res.json();
    })
    .then(renderProducts)
    .catch(renderError);

  /* ---------------------------------------------------------
     Корзина и оформление заказа
     --------------------------------------------------------- */
  var CART_KEY = "royalfish_cart_v1";
  var productsById = {};
  var cart = loadCart();

  function loadCart() {
    try {
      var raw = window.localStorage.getItem(CART_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (it) {
        return it && Number.isInteger(it.productId) && Number.isInteger(it.quantity) && it.quantity > 0;
      });
    } catch (e) {
      return [];
    }
  }
  function saveCart() {
    try { window.localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* localStorage недоступен — просто не сохраняем между визитами */ }
  }
  function getCartItem(productId) {
    return cart.filter(function (it) { return it.productId === productId; })[0];
  }
  function cartCount() {
    return cart.reduce(function (sum, it) { return sum + it.quantity; }, 0);
  }
  function cartTotal() {
    return cart.reduce(function (sum, it) {
      var p = productsById[it.productId];
      return p ? sum + p.finalPrice * it.quantity : sum;
    }, 0);
  }
  function addToCart(productId, quantity) {
    var item = getCartItem(productId);
    if (item) item.quantity = Math.min(item.quantity + quantity, 99);
    else cart.push({ productId: productId, quantity: Math.min(quantity, 99) });
    saveCart();
    renderCartBadge();
    renderCartItems();
  }
  function setCartQuantity(productId, quantity) {
    if (quantity <= 0) {
      cart = cart.filter(function (it) { return it.productId !== productId; });
    } else {
      var item = getCartItem(productId);
      if (item) item.quantity = Math.min(quantity, 99);
    }
    saveCart();
    renderCartBadge();
    renderCartItems();
  }
  function removeFromCart(productId) {
    cart = cart.filter(function (it) { return it.productId !== productId; });
    saveCart();
    renderCartBadge();
    renderCartItems();
  }
  function flashAddedToCart(btn) {
    var original = btn.textContent;
    btn.textContent = "Добавлено ✓";
    btn.classList.add("is-added");
    setTimeout(function () {
      btn.textContent = original;
      btn.classList.remove("is-added");
    }, 1100);
  }

  var cartFab = document.getElementById("cartFab");
  var cartCountEl = document.getElementById("cartCount");
  var cartOverlay = document.getElementById("cartOverlay");
  var cartCloseBtn = document.getElementById("cartCloseBtn");
  var cartItemsEl = document.getElementById("cartItems");
  var cartEmptyMsg = document.getElementById("cartEmptyMsg");
  var cartSummaryEl = document.getElementById("cartSummary");
  var cartTotalEl = document.getElementById("cartTotal");
  var cartCheckoutBtn = document.getElementById("cartCheckoutBtn");
  var cartPanelTitle = document.getElementById("cartPanelTitle");

  var viewItems = document.getElementById("cartViewItems");
  var viewCheckout = document.getElementById("cartViewCheckout");
  var viewSuccess = document.getElementById("cartViewSuccess");
  var cartBackBtn = document.getElementById("cartBackBtn");
  var checkoutForm = document.getElementById("checkoutForm");
  var checkoutTotalEl = document.getElementById("checkoutTotal");
  var checkoutError = document.getElementById("checkoutError");
  var checkoutSubmitBtn = document.getElementById("checkoutSubmitBtn");
  var successOrderId = document.getElementById("successOrderId");
  var cartSuccessCloseBtn = document.getElementById("cartSuccessCloseBtn");

  function renderCartBadge() {
    var count = cartCount();
    cartCountEl.textContent = String(count);
    cartCountEl.hidden = count === 0;
  }

  function showCartView(view) {
    [viewItems, viewCheckout, viewSuccess].forEach(function (v) { v.hidden = v !== view; });
    if (view === viewItems) cartPanelTitle.textContent = "Корзина";
    else if (view === viewCheckout) cartPanelTitle.textContent = "Оформление заказа";
    else cartPanelTitle.textContent = "Заказ принят";
  }

  function renderCartItems() {
    cartItemsEl.innerHTML = "";
    var validItems = cart.filter(function (it) { return productsById[it.productId]; });

    if (!validItems.length) {
      cartEmptyMsg.hidden = false;
      cartSummaryEl.hidden = true;
      return;
    }
    cartEmptyMsg.hidden = true;
    cartSummaryEl.hidden = false;

    var fragment = document.createDocumentFragment();
    validItems.forEach(function (it) {
      var p = productsById[it.productId];
      var row = document.createElement("div");
      row.className = "cart-item";
      row.innerHTML =
        '<div class="cart-item-media">' +
          (p.image
            ? '<img src="' + escapeHtml(optimizeCloudinaryUrl(p.image, 150)) + '" alt="" loading="lazy">'
            : '<div class="no-image no-image--sm">Фото</div>') +
        "</div>" +
        '<div class="cart-item-body">' +
          '<p class="cart-item-name">' + escapeHtml(p.name) + "</p>" +
          '<p class="cart-item-price">' + formatPrice(p.finalPrice) + " сомони</p>" +
        "</div>" +
        '<div class="cart-item-actions">' +
          '<div class="qty-stepper qty-stepper--sm">' +
            '<button type="button" class="qty-btn" data-action="dec" aria-label="Уменьшить количество">&minus;</button>' +
            '<span class="qty-value">' + it.quantity + "</span>" +
            '<button type="button" class="qty-btn" data-action="inc" aria-label="Увеличить количество">+</button>' +
          "</div>" +
          '<button type="button" class="cart-item-remove" aria-label="Убрать из корзины">&times;</button>' +
        "</div>";

      row.querySelector('[data-action="dec"]').addEventListener("click", function () {
        setCartQuantity(it.productId, it.quantity - 1);
      });
      row.querySelector('[data-action="inc"]').addEventListener("click", function () {
        setCartQuantity(it.productId, it.quantity + 1);
      });
      row.querySelector(".cart-item-remove").addEventListener("click", function () {
        removeFromCart(it.productId);
      });

      fragment.appendChild(row);
    });
    cartItemsEl.appendChild(fragment);

    var total = cartTotal();
    cartTotalEl.textContent = formatPrice(total) + " сомони";
    checkoutTotalEl.textContent = formatPrice(total) + " сомони";
  }

  function openCart() {
    renderCartItems();
    showCartView(viewItems);
    cartOverlay.classList.add("is-open");
    document.body.classList.add("cart-open");
  }
  function closeCart() {
    cartOverlay.classList.remove("is-open");
    document.body.classList.remove("cart-open");
  }

  cartFab.addEventListener("click", openCart);
  cartCloseBtn.addEventListener("click", closeCart);
  cartOverlay.addEventListener("click", function (e) {
    if (e.target === cartOverlay) closeCart();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && cartOverlay.classList.contains("is-open")) closeCart();
  });

  cartCheckoutBtn.addEventListener("click", function () {
    showCartView(viewCheckout);
  });
  cartBackBtn.addEventListener("click", function () {
    showCartView(viewItems);
  });

  function buildAddressString() {
    var street = document.getElementById("checkoutAddress").value.trim();
    var entrance = document.getElementById("checkoutEntrance").value.trim();
    var intercom = document.getElementById("checkoutIntercom").value.trim();
    var floor = document.getElementById("checkoutFloor").value.trim();
    var apartment = document.getElementById("checkoutApartment").value.trim();

    if (!street) return "";

    var parts = [street];
    if (entrance) parts.push("подъезд " + entrance);
    if (floor) parts.push("этаж " + floor);
    if (apartment) parts.push("кв. " + apartment);
    if (intercom) parts.push("домофон " + intercom);

    return parts.join(", ");
  }

  checkoutForm.addEventListener("submit", function (e) {
    e.preventDefault();
    checkoutError.hidden = true;

    var items = cart
      .filter(function (it) { return productsById[it.productId]; })
      .map(function (it) { return { productId: it.productId, quantity: it.quantity }; });

    var payload = {
      customerName: document.getElementById("checkoutName").value.trim(),
      customerPhone: document.getElementById("checkoutPhone").value.trim(),
      customerAddress: buildAddressString(),
      comment: document.getElementById("checkoutComment").value.trim(),
      items: items,
      // honeypot: у настоящих посетителей всегда пустое (поле скрыто в
      // styles.css) — сервер отклонит запрос, если оно заполнено
      website: document.getElementById("checkoutWebsite").value,
    };

    if (!payload.customerName || !payload.customerPhone) {
      checkoutError.textContent = "Укажите имя и номер телефона.";
      checkoutError.hidden = false;
      return;
    }
    if (!items.length) {
      checkoutError.textContent = "Корзина пуста.";
      checkoutError.hidden = false;
      return;
    }

    checkoutSubmitBtn.disabled = true;
    checkoutSubmitBtn.textContent = "Оформляем…";

    fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Не удалось оформить заказ.");
          return data;
        });
      })
      .then(function (order) {
        cart = [];
        saveCart();
        renderCartBadge();
        successOrderId.textContent = order.id;
        showCartView(viewSuccess);
        checkoutForm.reset();
      })
      .catch(function (err) {
        checkoutError.textContent = err.message;
        checkoutError.hidden = false;
      })
      .finally(function () {
        checkoutSubmitBtn.disabled = false;
        checkoutSubmitBtn.textContent = "Подтвердить заказ";
      });
  });

  cartSuccessCloseBtn.addEventListener("click", closeCart);

  renderCartBadge();

  /* ---------------------------------------------------------
     Рекламный слайдер на главной (управляется из админки)
     --------------------------------------------------------- */
  (function initPromoSlider() {
    var wrap = document.getElementById("promoSlider");
    var track = document.getElementById("promoSliderTrack");
    var dotsWrap = document.getElementById("promoSliderDots");
    // две пары стрелок: поверх фото (десктоп, по наведению) и под баннером
    // (тач-устройства, видны всегда) — см. styles.css и комментарии в index.html
    var prevBtns = wrap ? wrap.querySelectorAll(".promo-arrow--prev") : [];
    var nextBtns = wrap ? wrap.querySelectorAll(".promo-arrow--next") : [];
    var infoEl = document.getElementById("promoSlideInfo");
    var textEl = document.getElementById("promoSlideText");
    if (!wrap || !track || !dotsWrap) return;

    var current = 0;
    var timer = null;
    var slides = [];

    function renderSlides() {
      track.innerHTML = "";
      dotsWrap.innerHTML = "";

      slides.forEach(function (slide, index) {
        var el = document.createElement("div");
        el.className = "promo-slide" + (index === 0 ? " is-active" : "");
        el.innerHTML =
          '<img src="' + escapeHtml(optimizeCloudinaryUrl(slide.image, 1200)) + '" alt="' + escapeHtml(slide.title || "Реклама") + '" loading="' + (index === 0 ? "eager" : "lazy") + '">';
        track.appendChild(el);

        var dot = document.createElement("button");
        dot.type = "button";
        dot.className = "promo-dot" + (index === 0 ? " is-active" : "");
        dot.setAttribute("aria-label", "Слайд " + (index + 1));
        dot.addEventListener("click", function () {
          goTo(index);
          restartTimer();
        });
        dotsWrap.appendChild(dot);
      });

      var showArrows = slides.length > 1;
      prevBtns.forEach(function (btn) { btn.hidden = !showArrows; });
      nextBtns.forEach(function (btn) { btn.hidden = !showArrows; });

      updateInfo(0, true);
    }

    // Текст под баннером синхронизирован с активным слайдом — мягко
    // перекрашивается (fade) при смене, а не дёргается резко.
    function updateInfo(index, isFirstRender) {
      if (!infoEl || !textEl) return;
      var slide = slides[index];
      var title = slide && slide.title ? slide.title : "";

      function applyText() {
        textEl.textContent = title;
        infoEl.classList.toggle("promo-slide-info--no-text", !title);
      }

      if (isFirstRender || reduceMotion) {
        applyText();
        return;
      }

      infoEl.classList.add("is-fading");
      setTimeout(function () {
        applyText();
        infoEl.classList.remove("is-fading");
      }, 180);
    }

    function goTo(index) {
      var slideEls = track.querySelectorAll(".promo-slide");
      var dotEls = dotsWrap.querySelectorAll(".promo-dot");
      if (!slideEls.length) return;

      current = (index + slideEls.length) % slideEls.length;
      slideEls.forEach(function (el, i) { el.classList.toggle("is-active", i === current); });
      dotEls.forEach(function (el, i) { el.classList.toggle("is-active", i === current); });
      updateInfo(current, false);
    }

    function nextSlide() {
      goTo(current + 1);
    }

    function restartTimer() {
      clearInterval(timer);
      if (slides.length > 1 && !reduceMotion) {
        timer = setInterval(nextSlide, 3000);
      }
    }

    prevBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        goTo(current - 1);
        restartTimer();
      });
    });
    nextBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        goTo(current + 1);
        restartTimer();
      });
    });

    fetch("/api/promo-slides")
      .then(function (res) {
        if (!res.ok) throw new Error("network");
        return res.json();
      })
      .then(function (data) {
        slides = Array.isArray(data) ? data : [];
        if (!slides.length) return; // нет слайдов — блок остаётся скрытым (fallback)

        renderSlides();
        wrap.hidden = false;
        restartTimer();
      })
      .catch(function () {
        // сеть/сервер недоступны — просто не показываем слайдер, сайт не ломается
      });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) clearInterval(timer);
      else restartTimer();
    });
  })();

  /* ---------------------------------------------------------
     Hero bubble animation (canvas, lightweight, no libraries)
     --------------------------------------------------------- */
  var canvas = document.getElementById("bubbleCanvas");
  if (canvas && !reduceMotion) {
    var ctx = canvas.getContext("2d");
    var hero = canvas.closest(".hero");
    var bubbles = [];
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var width = 0, height = 0;
    var isVisible = true;

    function rand(min, max) { return Math.random() * (max - min) + min; }

    function makeBubble(startAtBottom) {
      var r = rand(1.4, 5.5);
      return {
        x: rand(0, width),
        y: startAtBottom ? height + rand(0, 80) : rand(0, height),
        r: r,
        speed: rand(14, 34) * (1 / Math.max(r, 1.6)) + rand(6, 10),
        drift: rand(-10, 10),
        wobble: rand(0, Math.PI * 2),
        wobbleSpeed: rand(0.6, 1.6),
        alpha: rand(0.10, 0.34),
      };
    }

    function sizeCanvas() {
      width = hero.clientWidth;
      height = hero.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var targetCount = Math.min(70, Math.max(28, Math.round((width * height) / 26000)));
      bubbles = [];
      for (var i = 0; i < targetCount; i++) {
        bubbles.push(makeBubble(false));
      }
    }

    var lastTime = performance.now();
    function tick(now) {
      var dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      if (isVisible) {
        ctx.clearRect(0, 0, width, height);
        for (var i = 0; i < bubbles.length; i++) {
          var b = bubbles[i];
          b.wobble += b.wobbleSpeed * dt;
          b.y -= b.speed * dt;
          b.x += Math.sin(b.wobble) * 0.35 + b.drift * dt * 0.15;

          if (b.y < -10) {
            bubbles[i] = makeBubble(true);
            continue;
          }

          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255," + b.alpha + ")";
          ctx.fill();

          ctx.beginPath();
          ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, Math.max(b.r * 0.28, 0.4), 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255," + Math.min(b.alpha + 0.25, 0.55) + ")";
          ctx.fill();
        }
      }
      requestAnimationFrame(tick);
    }

    sizeCanvas();
    requestAnimationFrame(tick);

    window.addEventListener("resize", debounce(sizeCanvas, 200));

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        isVisible = entries[0].isIntersecting;
      }).observe(hero);
    }
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      clearTimeout(t);
      var args = arguments;
      t = setTimeout(function () { fn.apply(null, args); }, wait);
    };
  }
})();
