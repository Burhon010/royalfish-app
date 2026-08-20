(function () {
  "use strict";

  // Карточки товаров (.card, общий стиль с розничным каталогом) по умолчанию
  // невидимы (opacity: 0) — появление запускается добавлением класса
  // is-visible при попадании в область просмотра. Та же логика, что и в
  // script.js — здесь она не была отдельно продублирована, из-за чего
  // оптовые карточки навсегда оставались невидимыми.
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var revealObserver = null;

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

  /* ---------------------------------------------------------
     Year in footer
     --------------------------------------------------------- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------------------------------------------------------
     Header scroll state + mobile menu (та же логика, что в script.js,
     специально не вынесена в общий файл — см. README про архитектуру
     страницы /wholesale, оставлено раздельно, чтобы не трогать
     проверенный розничный script.js).
     --------------------------------------------------------- */
  var header = document.getElementById("siteHeader");
  function onScrollHeader() {
    if (window.scrollY > 12) header.classList.add("is-scrolled");
    else header.classList.remove("is-scrolled");
  }
  onScrollHeader();
  window.addEventListener("scroll", onScrollHeader, { passive: true });

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

  // Та же оптимизация Cloudinary-ссылок, что и в public/script.js.
  function optimizeCloudinaryUrl(url, width) {
    if (!url || typeof url !== "string") return url;
    if (url.indexOf("res.cloudinary.com") === -1 || url.indexOf("/upload/") === -1) return url;
    return url.replace("/upload/", "/upload/f_auto,q_auto,w_" + width + "/");
  }

  /* ---------------------------------------------------------
     Оптовый каталог: загрузка и рендер карточек
     --------------------------------------------------------- */
  var productGrid = document.getElementById("productGrid");
  var emptyState = document.getElementById("emptyState");
  var pills = Array.prototype.slice.call(document.querySelectorAll(".filter-pill"));
  var activeFilter = "all";
  var productsById = {};
  var hasProducts = false;

  function buildCard(p) {
    var article = document.createElement("article");
    article.className = "card" + (p.inStock ? "" : " is-out");
    article.setAttribute("data-id", p.id);
    article.setAttribute("data-cat", p.category);

    var mediaInner = p.image
      ? '<img src="' + escapeHtml(optimizeCloudinaryUrl(p.image, 700)) + '" alt="' + escapeHtml(p.name) + '" loading="lazy" width="900" height="700">'
      : '<div class="no-image">Фото скоро появится</div>';

    var descHtml = p.description
      ? '<p class="card-desc">' + escapeHtml(p.description) + "</p>"
      : "";

    var minQty = Math.max(1, Number(p.wholesaleMinQty) || 1);

    article.innerHTML =
      '<div class="card-media">' +
        mediaInner +
        '<span class="status-chip ' + (p.inStock ? "status-in" : "status-out") + '">' +
          (p.inStock ? "В наличии" : "Нет в наличии") +
        "</span>" +
      "</div>" +
      '<div class="card-body">' +
        '<h3 class="card-name">' + escapeHtml(p.name) + "</h3>" +
        '<p class="card-weight">' + escapeHtml(p.weight) + "</p>" +
        descHtml +
        '<span class="moq-note">от ' + minQty + " шт. в заказе</span>" +
        '<div class="card-price-row"><span class="price">' + formatPrice(p.wholesalePrice) + " сомони / ед.</span></div>" +
        '<div class="card-cart-row">' +
          '<div class="qty-stepper" data-role="qty">' +
            '<button type="button" class="qty-btn" data-action="dec" aria-label="Уменьшить количество">&minus;</button>' +
            '<span class="qty-value">' + minQty + "</span>" +
            '<button type="button" class="qty-btn" data-action="inc" aria-label="Увеличить количество">+</button>' +
          "</div>" +
          '<button type="button" class="btn-add-cart"' + (p.inStock ? "" : " disabled") + '>' +
            (p.inStock ? "В заявку" : "Нет в наличии") +
          "</button>" +
        "</div>" +
      "</div>";

    if (p.inStock) {
      var qtyValueEl = article.querySelector(".qty-value");
      var decBtn = article.querySelector('[data-action="dec"]');
      var incBtn = article.querySelector('[data-action="inc"]');
      var addBtn = article.querySelector(".btn-add-cart");

      // Количество на карточке не может уйти ниже минимальной оптовой
      // партии товара — это ограничение конкретного товара, а не общая
      // "1 шт." по умолчанию, как в рознице.
      decBtn.addEventListener("click", function () {
        var v = Math.max(minQty, Number(qtyValueEl.textContent) - 1);
        qtyValueEl.textContent = String(v);
      });
      incBtn.addEventListener("click", function () {
        var v = Math.min(999, Number(qtyValueEl.textContent) + 1);
        qtyValueEl.textContent = String(v);
      });
      addBtn.addEventListener("click", function () {
        var qty = Math.max(minQty, Number(qtyValueEl.textContent) || minQty);
        addToCart(p.id, qty);
        flashAddedToCart(addBtn);
      });
    }

    return article;
  }

  function renderProducts(products) {
    productGrid.innerHTML = "";
    productsById = {};
    products.forEach(function (p) { productsById[p.id] = p; });

    hasProducts = products.length > 0;
    if (!hasProducts) {
      productGrid.innerHTML = "";
      emptyState.textContent = "Пока нет товаров в оптовом каталоге. Загляните позже.";
      emptyState.hidden = false;
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

    initReveal(cards);
    applyFilter();
    renderCartItems();
  }

  // Фильтр по категориям — та же механика, что и в рознице (script.js):
  // карточки не пересоздаются, просто скрываются классом is-filtered-out.
  function applyFilter() {
    if (!hasProducts) return;
    var cards = Array.prototype.slice.call(productGrid.querySelectorAll(".card"));
    var visibleCount = 0;

    cards.forEach(function (card) {
      var match = activeFilter === "all" || card.getAttribute("data-cat") === activeFilter;
      card.classList.toggle("is-filtered-out", !match);
      if (match) visibleCount++;
    });

    if (visibleCount === 0) {
      emptyState.textContent = "В этой категории пока нет товаров. Попробуйте другую.";
      emptyState.hidden = false;
    } else {
      emptyState.hidden = true;
    }
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

  function renderError() {
    productGrid.innerHTML = '<p class="catalog-status is-error">Не удалось загрузить оптовый каталог. Попробуйте обновить страницу.</p>';
    emptyState.hidden = true;
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

  fetch("/api/wholesale/products")
    .then(function (res) {
      if (!res.ok) throw new Error("Ошибка сети");
      return res.json();
    })
    .then(renderProducts)
    .catch(renderError);

  /* ---------------------------------------------------------
     Оптовая корзина (заявка) — отдельный ключ localStorage, чтобы не
     смешиваться с розничной корзиной на главной странице.
     --------------------------------------------------------- */
  var CART_KEY = "royalfish_wholesale_cart_v1";
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
    try { window.localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* localStorage недоступен */ }
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
      return p ? sum + p.wholesalePrice * it.quantity : sum;
    }, 0);
  }
  function addToCart(productId, quantity) {
    var item = getCartItem(productId);
    if (item) item.quantity = Math.min(item.quantity + quantity, 999);
    else cart.push({ productId: productId, quantity: Math.min(quantity, 999) });
    saveCart();
    renderCartBadge();
    renderCartItems();
  }
  function setCartQuantity(productId, quantity) {
    var p = productsById[productId];
    var minQty = p ? Math.max(1, Number(p.wholesaleMinQty) || 1) : 1;
    if (quantity < minQty) {
      cart = cart.filter(function (it) { return it.productId !== productId; });
    } else {
      var item = getCartItem(productId);
      if (item) item.quantity = Math.min(quantity, 999);
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
    if (view === viewItems) cartPanelTitle.textContent = "Оптовая заявка";
    else if (view === viewCheckout) cartPanelTitle.textContent = "Оформление заявки";
    else cartPanelTitle.textContent = "Заявка принята";
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
      var minQty = Math.max(1, Number(p.wholesaleMinQty) || 1);
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
          '<p class="cart-item-price">' + formatPrice(p.wholesalePrice) + " сомони / ед. · мин. " + minQty + "</p>" +
        "</div>" +
        '<div class="cart-item-actions">' +
          '<div class="qty-stepper qty-stepper--sm">' +
            '<button type="button" class="qty-btn" data-action="dec" aria-label="Уменьшить количество">&minus;</button>' +
            '<span class="qty-value">' + it.quantity + "</span>" +
            '<button type="button" class="qty-btn" data-action="inc" aria-label="Увеличить количество">+</button>' +
          "</div>" +
          '<button type="button" class="cart-item-remove" aria-label="Убрать из заявки">&times;</button>' +
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

  checkoutForm.addEventListener("submit", function (e) {
    e.preventDefault();
    checkoutError.hidden = true;

    var items = cart
      .filter(function (it) { return productsById[it.productId]; })
      .map(function (it) { return { productId: it.productId, quantity: it.quantity }; });

    var payload = {
      orderType: "wholesale",
      companyName: document.getElementById("checkoutCompany").value.trim(),
      customerName: document.getElementById("checkoutName").value.trim(),
      customerPhone: document.getElementById("checkoutPhone").value.trim(),
      customerAddress: document.getElementById("checkoutAddress").value.trim(),
      comment: document.getElementById("checkoutComment").value.trim(),
      items: items,
      // honeypot — как на розничной странице, см. server/routes/orders.routes.js
      website: document.getElementById("checkoutWebsite").value,
    };

    if (!payload.companyName) {
      checkoutError.textContent = "Укажите название ресторана или компании.";
      checkoutError.hidden = false;
      return;
    }
    if (!payload.customerName || !payload.customerPhone) {
      checkoutError.textContent = "Укажите контактное лицо и номер телефона.";
      checkoutError.hidden = false;
      return;
    }
    if (!items.length) {
      checkoutError.textContent = "Заявка пуста.";
      checkoutError.hidden = false;
      return;
    }

    checkoutSubmitBtn.disabled = true;
    checkoutSubmitBtn.textContent = "Отправляем…";

    fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Не удалось отправить заявку.");
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
        checkoutSubmitBtn.textContent = "Отправить заявку";
      });
  });

  cartSuccessCloseBtn.addEventListener("click", closeCart);

  renderCartBadge();
})();
