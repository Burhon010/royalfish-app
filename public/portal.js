(function () {
  "use strict";

  var ORDER_STATUS = {
    awaiting: "Ожидает подтверждения",
    confirmed: "Подтверждён",
    rejected: "Отклонён",
    processing: "В обработке",
    ready: "Готов к выдаче / доставке",
    completed: "Выполнен",
    cancelled: "Отменён",
  };
  var ACCOUNT_STATUS = {
    pending: "Ожидает одобрения",
    approved: "Одобрен",
    rejected: "Отклонён",
    blocked: "Заблокирован",
  };

  var profile = null;
  var catalog = [];
  var categories = [];
  var activeCat = "all";
  var searchQuery = "";
  var cart = [];
  var orders = [];

  var el = function (id) { return document.getElementById(id); };
  var toastEl = el("toast");
  var toastTimer = null;

  function showToast(msg, isError) {
    toastEl.textContent = msg;
    toastEl.classList.toggle("is-error", !!isError);
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 3200);
  }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function money(n) {
    var num = Number(n);
    var s = Number.isInteger(num) ? String(num) : num.toFixed(2).replace(".", ",");
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  function blocksWord(n) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return "блок";
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "блока";
    return "блоков";
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function api(method, url, body) {
    return fetch(url, {
      method: method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401) {
          window.location.href = "partner-login.html";
          throw new Error("unauthorized");
        }
        if (!res.ok) throw new Error(data.error || "Ошибка запроса.");
        return data;
      });
    });
  }

  /* ---------------- корзина ---------------- */
  function cartKey() { return "rf_partner_cart_" + (profile ? profile.id : "x"); }
  function loadCart() {
    try {
      var raw = window.localStorage.getItem(cartKey());
      var parsed = raw ? JSON.parse(raw) : [];
      cart = Array.isArray(parsed) ? parsed.filter(function (it) {
        return it && Number.isInteger(it.productId) && Number.isInteger(it.blocks) && it.blocks > 0;
      }) : [];
    } catch (e) { cart = []; }
  }
  function saveCart() {
    try { window.localStorage.setItem(cartKey(), JSON.stringify(cart)); } catch (e) { /* без localStorage */ }
  }
  function productById(id) {
    return catalog.filter(function (p) { return p.id === id; })[0];
  }
  function cartLines() {
    return cart.map(function (it) {
      var p = productById(it.productId);
      return p ? { item: it, product: p } : null;
    }).filter(Boolean);
  }
  function cartTotals() {
    var blocks = 0, units = 0, sum = 0;
    cartLines().forEach(function (l) {
      blocks += l.item.blocks;
      units += l.item.blocks * l.product.unitsPerBlock;
      sum += l.item.blocks * l.product.pricePerBlock;
    });
    return { blocks: blocks, units: units, sum: Math.round(sum * 100) / 100 };
  }
  function addToCart(productId, blocks) {
    var it = cart.filter(function (c) { return c.productId === productId; })[0];
    if (it) it.blocks = Math.min(it.blocks + blocks, 999);
    else cart.push({ productId: productId, blocks: Math.min(blocks, 999) });
    saveCart();
    renderCartBar();
  }
  function setBlocks(productId, blocks) {
    if (blocks <= 0) cart = cart.filter(function (c) { return c.productId !== productId; });
    else cart.forEach(function (c) { if (c.productId === productId) c.blocks = Math.min(blocks, 999); });
    saveCart();
    renderCartBar();
  }

  function renderCartBar() {
    var t = cartTotals();
    el("cartBar").hidden = !(profile && profile.status === "approved") || t.blocks === 0;
    el("cartBarLine").textContent = t.blocks + " " + blocksWord(t.blocks) + " · " + t.units + " шт.";
    el("cartBarTotal").textContent = money(t.sum) + " сомони";
  }

  /* ---------------- каталог ---------------- */
  function renderCategoryPills() {
    var used = {};
    catalog.forEach(function (p) { used[p.category] = true; });
    var html = '<button class="filter-pill" data-filter="all" role="tab" aria-selected="false">Все</button>';
    categories.forEach(function (c) {
      if (!used[c.slug]) return;
      html += '<button class="filter-pill" data-filter="' + esc(c.slug) + '" role="tab" aria-selected="false">' + esc(c.name) + "</button>";
    });
    var row = el("catFilterRow");
    row.innerHTML = html;
    var cur = row.querySelector('[data-filter="' + activeCat + '"]');
    if (!cur) { activeCat = "all"; cur = row.querySelector('[data-filter="all"]'); }
    cur.classList.add("is-active");
    cur.setAttribute("aria-selected", "true");
  }

  el("catFilterRow").addEventListener("click", function (e) {
    var pill = e.target.closest(".filter-pill");
    if (!pill) return;
    Array.prototype.forEach.call(el("catFilterRow").querySelectorAll(".filter-pill"), function (p) {
      p.classList.remove("is-active");
      p.setAttribute("aria-selected", "false");
    });
    pill.classList.add("is-active");
    pill.setAttribute("aria-selected", "true");
    activeCat = pill.getAttribute("data-filter");
    renderCatalog();
  });
  el("catalogSearch").addEventListener("input", function () {
    searchQuery = this.value.trim().toLowerCase();
    renderCatalog();
  });

  function cardCalc(p, blocks) {
    if (blocks < 1) return "Выберите количество блоков";
    return blocks + " " + blocksWord(blocks) + " × " + p.unitsPerBlock + " = " + (blocks * p.unitsPerBlock) + " шт.";
  }

  function buildCard(p) {
    var art = document.createElement("article");
    art.className = "portal-card";
    var media = p.image
      ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" width="900" height="700">'
      : "";
    art.innerHTML =
      '<div class="portal-card-media">' + media + "</div>" +
      '<div class="portal-card-body">' +
        '<h3 class="portal-card-name">' + esc(p.name) + "</h3>" +
        '<p class="portal-card-weight">' + esc(p.weight) + "</p>" +
        '<span class="portal-block-note">1 блок = ' + p.unitsPerBlock + " шт.</span>" +
        '<div class="portal-price">' + money(p.pricePerBlock) + " <small>сомони / блок</small></div>" +
        '<div class="portal-card-actions">' +
          '<div class="portal-card-calc">' + cardCalc(p, 0) + "</div>" +
          '<div class="qty-stepper">' +
            '<button type="button" class="qty-btn" data-a="dec" aria-label="Меньше">&minus;</button>' +
            '<span class="qty-value">0</span>' +
            '<button type="button" class="qty-btn" data-a="inc" aria-label="Больше">+</button>' +
          "</div>" +
          '<button type="button" class="btn-add-cart">В корзину</button>' +
        "</div>" +
      "</div>";

    var valueEl = art.querySelector(".qty-value");
    var calcEl = art.querySelector(".portal-card-calc");
    function setVal(v) {
      valueEl.textContent = String(v);
      calcEl.textContent = cardCalc(p, v);
    }
    art.querySelector('[data-a="dec"]').addEventListener("click", function () {
      setVal(Math.max(0, Number(valueEl.textContent) - 1));
    });
    art.querySelector('[data-a="inc"]').addEventListener("click", function () {
      setVal(Math.min(999, Number(valueEl.textContent) + 1));
    });
    var addBtn = art.querySelector(".btn-add-cart");
    addBtn.addEventListener("click", function () {
      var v = Number(valueEl.textContent);
      if (v < 1) {
        valueEl.classList.add("is-empty-flash");
        setTimeout(function () { valueEl.classList.remove("is-empty-flash"); }, 600);
        return;
      }
      addToCart(p.id, v);
      setVal(0);
      addBtn.textContent = "Добавлено ✓";
      setTimeout(function () { addBtn.textContent = "В корзину"; }, 1100);
    });
    return art;
  }

  function renderCatalog() {
    var grid = el("catalogGrid");
    var list = catalog.filter(function (p) {
      return (activeCat === "all" || p.category === activeCat) &&
        (!searchQuery || p.name.toLowerCase().indexOf(searchQuery) !== -1);
    });
    grid.innerHTML = "";
    if (!catalog.length) {
      grid.innerHTML = '<p class="p-empty">В оптовом каталоге пока нет товаров.</p>';
      return;
    }
    if (!list.length) {
      grid.innerHTML = '<p class="p-empty">Ничего не найдено.</p>';
      return;
    }
    var frag = document.createDocumentFragment();
    list.forEach(function (p) { frag.appendChild(buildCard(p)); });
    grid.appendChild(frag);
  }

  /* ---------------- корзина: окно ---------------- */
  var cartOverlay = el("cartOverlay");
  var cartBody = el("cartBody");

  function openCart() {
    el("cartTitle").textContent = "Корзина";
    renderCartBody();
    cartOverlay.hidden = false;
  }
  function closeCart() { cartOverlay.hidden = true; }
  el("openCartBtn").addEventListener("click", openCart);
  el("cartClose").addEventListener("click", closeCart);
  cartOverlay.addEventListener("click", function (e) { if (e.target === cartOverlay) closeCart(); });

  function renderCartBody() {
    var lines = cartLines();
    if (!lines.length) {
      cartBody.innerHTML = '<p class="p-empty">Корзина пуста. Добавьте товары из каталога.</p>';
      return;
    }
    var t = cartTotals();
    var rows = lines.map(function (l) {
      var p = l.product, b = l.item.blocks;
      return "<tr>" +
        "<td>" + esc(p.name) + "<br><small>" + esc(p.weight) + "</small></td>" +
        '<td><div class="qty-stepper qty-stepper--sm">' +
          '<button type="button" class="qty-btn" data-a="dec" data-id="' + p.id + '">&minus;</button>' +
          '<span class="qty-value">' + b + "</span>" +
          '<button type="button" class="qty-btn" data-a="inc" data-id="' + p.id + '">+</button>' +
        "</div></td>" +
        '<td class="num">' + (b * p.unitsPerBlock) + "</td>" +
        '<td class="num">' + money(p.pricePerBlock) + "</td>" +
        '<td class="num">' + money(b * p.pricePerBlock) + "</td>" +
        '<td><button type="button" class="p-close" data-a="del" data-id="' + p.id + '" aria-label="Убрать">&times;</button></td>' +
      "</tr>";
    }).join("");

    cartBody.innerHTML =
      '<div class="p-table-wrap"><table class="p-table"><thead><tr>' +
        "<th>Товар</th><th>Блоков</th><th>Штук</th><th>Цена/блок</th><th>Сумма</th><th></th>" +
      "</tr></thead><tbody>" + rows + "</tbody><tfoot><tr>" +
        "<td>Всего</td><td class=\"num\">" + t.blocks + "</td><td class=\"num\">" + t.units + "</td><td></td>" +
        '<td class="num">' + money(t.sum) + "</td><td></td></tr></tfoot></table></div>" +
      '<div class="p-note">Наличие товара не ограничивает заказ: сотрудник Royal Fish проверит фактическое количество и свяжется с вами, если что-то нужно уточнить.</div>' +
      '<div class="p-info"><span><b>Доставка / адрес:</b> ' + esc(profile.address) + "</span><span><b>Телефон:</b> " + esc(profile.phone) + "</span></div>" +
      '<form class="pform" id="orderForm" novalidate>' +
        '<label class="field"><span>Комментарий к заказу <em>(необязательно)</em></span>' +
        '<textarea id="orderComment" rows="3" maxlength="500"></textarea></label>' +
        '<p class="pform-msg is-error" id="orderError" hidden></p>' +
        '<button type="submit" class="btn btn--gold" id="orderSubmit">Оформить заказ · ' + money(t.sum) + " сомони</button>" +
      "</form>";

    cartBody.querySelectorAll("[data-a]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = Number(b.getAttribute("data-id"));
        var it = cart.filter(function (c) { return c.productId === id; })[0];
        if (!it) return;
        var a = b.getAttribute("data-a");
        if (a === "inc") setBlocks(id, it.blocks + 1);
        else if (a === "dec") setBlocks(id, it.blocks - 1);
        else setBlocks(id, 0);
        renderCartBody();
      });
    });

    el("orderForm").addEventListener("submit", submitOrder);
  }

  function submitOrder(e) {
    e.preventDefault();
    var errBox = el("orderError");
    var btn = el("orderSubmit");
    errBox.hidden = true;
    btn.disabled = true;
    btn.textContent = "Отправляем…";

    api("POST", "/api/partners/orders", {
      items: cart.map(function (c) { return { productId: c.productId, blocks: c.blocks }; }),
      comment: el("orderComment").value.trim(),
    })
      .then(function (order) {
        cart = [];
        saveCart();
        renderCartBar();
        showOrderSuccess(order);
        loadOrders();
      })
      .catch(function (err) {
        errBox.textContent = err.message;
        errBox.hidden = false;
        btn.disabled = false;
        btn.textContent = "Оформить заказ";
      });
  }

  function showOrderSuccess(order) {
    el("cartTitle").textContent = "Заказ оформлен";
    cartBody.innerHTML =
      '<div class="p-note">Заказ <b>' + esc(order.number) + "</b> принят. Статус: <b>" + ORDER_STATUS[order.status] +
      "</b>. Сотрудник Royal Fish проверит наличие и свяжется с вами.</div>" +
      orderTableHtml(order) +
      '<div class="p-actions">' +
        '<a class="p-btn" target="_blank" rel="noopener" href="print-order.html?id=' + order.id + '&src=partner&mode=pdf">Скачать PDF</a>' +
        '<a class="p-btn p-btn--ghost" target="_blank" rel="noopener" href="print-order.html?id=' + order.id + '&src=partner&mode=print">Распечатать</a>' +
        '<button type="button" class="p-btn p-btn--ghost" id="successClose">Закрыть</button>' +
      "</div>";
    el("successClose").addEventListener("click", closeCart);
  }

  /* ---------------- заказы ---------------- */
  function orderTableHtml(o) {
    var t = o.totals;
    var showConf = t.hasConfirmed;
    var rows = o.items.map(function (it) {
      return "<tr><td>" + esc(it.productName) + "</td>" +
        '<td class="num">' + it.orderedBlocks + "</td>" +
        '<td class="num">' + it.orderedUnits + "</td>" +
        '<td class="num">' + money(it.pricePerBlock) + "</td>" +
        '<td class="num">' + money(it.orderedSubtotal) + "</td>" +
        (showConf ? '<td class="num">' + (it.confirmedBlocks === null ? "—" : it.confirmedBlocks) + "</td>" : "") +
      "</tr>";
    }).join("");
    return '<div class="p-table-wrap"><table class="p-table"><thead><tr>' +
      "<th>Товар</th><th>Заказано блоков</th><th>Штук</th><th>Цена/блок</th><th>Сумма</th>" +
      (showConf ? "<th>Подтверждено блоков</th>" : "") +
      "</tr></thead><tbody>" + rows + "</tbody><tfoot><tr><td>Всего</td>" +
      '<td class="num">' + t.orderedBlocks + '</td><td class="num">' + t.orderedUnits + "</td><td></td>" +
      '<td class="num">' + money(t.orderedTotal) + "</td>" +
      (showConf ? '<td class="num">' + t.confirmedBlocks + "</td>" : "") +
      "</tr></tfoot></table></div>" +
      (showConf
        ? '<div class="p-note">Подтверждено сотрудником: <b>' + t.confirmedBlocks + " " + blocksWord(t.confirmedBlocks) +
          " · " + t.confirmedUnits + " шт. · " + money(t.confirmedTotal) + " сомони</b></div>"
        : "");
  }

  function loadOrders() {
    return api("GET", "/api/partners/orders").then(function (list) {
      orders = list;
      renderOrders();
    });
  }

  function renderOrders() {
    var box = el("orderList");
    if (!orders.length) {
      box.innerHTML = '<p class="p-empty">Заказов пока нет. Оформите первый заказ в каталоге.</p>';
      return;
    }
    box.innerHTML = orders.map(function (o) {
      return '<button type="button" class="p-order" data-id="' + o.id + '">' +
        '<span class="p-order-num">' + esc(o.number) + "</span>" +
        '<span class="p-order-sum">' + money(o.totals.orderedTotal) + " сомони</span>" +
        '<span class="p-order-meta">' + fmtDate(o.createdAt) + " · " + o.totals.orderedBlocks + " " + blocksWord(o.totals.orderedBlocks) + " · " + o.totals.orderedUnits + " шт.</span>" +
        '<span class="p-badge st-' + o.status + '">' + ORDER_STATUS[o.status] + "</span>" +
      "</button>";
    }).join("");
    box.querySelectorAll(".p-order").forEach(function (b) {
      b.addEventListener("click", function () {
        var o = orders.filter(function (x) { return x.id === Number(b.getAttribute("data-id")); })[0];
        if (o) openOrder(o);
      });
    });
  }

  var orderOverlay = el("orderOverlay");
  function openOrder(o) {
    el("orderTitle").textContent = "Заказ " + o.number;
    el("orderBody").innerHTML =
      '<div class="p-info"><span><span class="p-badge st-' + o.status + '">' + ORDER_STATUS[o.status] + "</span></span>" +
      "<span><b>Дата:</b> " + fmtDate(o.createdAt) + "</span>" +
      "<span><b>Адрес:</b> " + esc(o.restaurantAddress) + "</span></div>" +
      (o.customerComment ? '<div class="p-note"><b>Ваш комментарий:</b> ' + esc(o.customerComment) + "</div>" : "") +
      orderTableHtml(o) +
      (o.adminComment ? '<div class="p-note"><b>Комментарий Royal Fish:</b> ' + esc(o.adminComment) + "</div>" : "") +
      '<div class="p-actions">' +
        '<a class="p-btn" target="_blank" rel="noopener" href="print-order.html?id=' + o.id + '&src=partner&mode=pdf">Скачать PDF</a>' +
        '<a class="p-btn p-btn--ghost" target="_blank" rel="noopener" href="print-order.html?id=' + o.id + '&src=partner&mode=print">Распечатать</a>' +
      "</div>";
    orderOverlay.hidden = false;
  }
  el("orderClose").addEventListener("click", function () { orderOverlay.hidden = true; });
  orderOverlay.addEventListener("click", function (e) { if (e.target === orderOverlay) orderOverlay.hidden = true; });

  /* ---------------- вкладки ---------------- */
  document.querySelectorAll(".portal-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".portal-tab").forEach(function (t) { t.classList.remove("is-active"); });
      tab.classList.add("is-active");
      var name = tab.getAttribute("data-tab");
      el("tabCatalog").hidden = name !== "catalog";
      el("tabOrders").hidden = name !== "orders";
      el("tabAccount").hidden = name !== "account";
    });
  });

  var impersonated = false;
  var impersonatedId = null;

  el("logoutBtn").addEventListener("click", function () {
    if (impersonated) {
      // выходим только из кабинета ресторана, сессия админа остаётся
      fetch("/api/partners/logout", { method: "POST", credentials: "same-origin" }).then(function () {
        window.location.href = "admin/restaurant.html?id=" + impersonatedId;
      });
      return;
    }
    fetch("/api/partners/logout", { method: "POST", credentials: "same-origin" }).then(function () {
      window.location.href = "wholesale.html";
    });
  });

  /* ---------------- старт ---------------- */
  api("GET", "/api/partners/me")
    .then(function (me) {
      profile = me;
      el("welcomeTitle").textContent = "Добро пожаловать, " + me.name;
      el("portalHelloName").textContent = me.name;
      el("portalHello").hidden = false;

      if (me.impersonated) {
        impersonated = true;
        impersonatedId = me.id;
        el("adminBar").hidden = false;
        el("adminBarName").textContent = me.name;
        el("adminBarBack").setAttribute("href", "admin/restaurant.html?id=" + me.id);
        el("logoutBtn").textContent = "Выйти из кабинета";
      }

      el("accountInfo").innerHTML =
        "<span><b>Ресторан:</b> " + esc(me.name) + "</span>" +
        "<span><b>Телефон:</b> " + esc(me.phone) + "</span>" +
        "<span><b>Адрес:</b> " + esc(me.address) + "</span>" +
        "<span><b>Статус:</b> " + ACCOUNT_STATUS[me.status] + "</span>" +
        (me.priceGroup ? "<span><b>Группа цен:</b> " + esc(me.priceGroup) + "</span>" : "") +
        "<span><b>Дата регистрации:</b> " + fmtDate(me.createdAt) + "</span>";

      var banner = el("statusBanner");
      if (me.status !== "approved") {
        el("welcomeSub").textContent = "Аккаунт создан.";
        banner.hidden = false;
        if (me.status === "pending") {
          banner.textContent = "Ваша заявка ожидает одобрения. Как только администратор Royal Fish её проверит, откроется каталог с вашими ценами и оформление заказов. Мы свяжемся с вами по телефону " + me.phone + ".";
        } else if (me.status === "rejected") {
          banner.classList.add("is-bad");
          banner.textContent = "Заявка отклонена. Если это ошибка, свяжитесь с Royal Fish по телефону.";
        } else {
          banner.classList.add("is-bad");
          banner.textContent = "Аккаунт заблокирован. Для разблокировки свяжитесь с Royal Fish.";
        }
        return;
      }

      el("welcomeSub").textContent = "Ваши оптовые цены — заказ блоками.";
      el("portalApp").hidden = false;
      loadCart();

      return Promise.all([
        api("GET", "/api/partners/catalog"),
        fetch("/api/categories").then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }),
        loadOrders(),
      ]).then(function (res) {
        catalog = res[0];
        categories = res[1];
        // убираем из корзины товары, которых больше нет в каталоге
        cart = cart.filter(function (c) { return productById(c.productId); });
        saveCart();
        renderCategoryPills();
        renderCatalog();
        renderCartBar();
      });
    })
    .catch(function (err) {
      if (err.message === "unauthorized") return;
      el("welcomeSub").textContent = "Не удалось загрузить кабинет. Обновите страницу.";
    });
})();
