(function () {
  "use strict";

  var STATUS_LABELS = {
    new: "Новый",
    processing: "В обработке",
    delivering: "Доставляется",
    completed: "Завершён",
  };
  var STATUS_ORDER = ["new", "processing", "delivering", "completed"];

  var orderList = document.getElementById("orderList");
  var listStatus = document.getElementById("listStatus");
  var toast = document.getElementById("toast");
  var adminUser = document.getElementById("adminUser");
  var filterPills = Array.prototype.slice.call(document.querySelectorAll("#orderFilterRow .filter-pill"));
  var activeFilter = "all";

  var typeTabs = Array.prototype.slice.call(document.querySelectorAll("#typeTabRow .tab-pill"));
  var activeType = "all"; // "all" | "retail" | "wholesale"

  var orders = [];

  /* ---------------------------------------------------------
     Проверка авторизации (как на странице товаров)
     --------------------------------------------------------- */
  fetch("/api/auth/me", { credentials: "same-origin" })
    .then(function (res) {
      if (!res.ok) throw new Error("unauthorized");
      return res.json();
    })
    .then(function (data) {
      adminUser.textContent = data.username;
      loadOrders();
    })
    .catch(function () {
      window.location.href = "login.html";
    });

  document.getElementById("logoutBtn").addEventListener("click", function () {
    fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).then(function () {
      window.location.href = "login.html";
    });
  });

  /* ---------------------------------------------------------
     Уведомления
     --------------------------------------------------------- */
  var toastTimer = null;
  function showToast(message, isError) {
    toast.textContent = message;
    toast.classList.toggle("is-error", !!isError);
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.hidden = true;
    }, 3200);
  }

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

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("ru-RU", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  }

  /* ---------------------------------------------------------
     Загрузка и рендер списка заказов
     --------------------------------------------------------- */
  function loadOrders() {
    listStatus.hidden = false;
    listStatus.textContent = "Загружаем заказы…";
    Promise.all([
      fetch("/api/admin/orders", { credentials: "same-origin" }).then(function (res) {
        if (res.status === 401) throw new Error("unauthorized");
        if (!res.ok) throw new Error("Ошибка сети");
        return res.json();
      }),
      // заказы ресторанов-партнёров (оптовый портал) — в том же списке
      fetch("/api/admin/wholesale-orders", { credentials: "same-origin" }).then(function (res) {
        if (res.status === 401) throw new Error("unauthorized");
        return res.ok ? res.json() : [];
      }).catch(function (err) {
        if (err.message === "unauthorized") throw err;
        return [];
      }),
    ])
      .then(function (res) {
        var portal = res[1].map(portalToRow);
        orders = res[0].concat(portal).sort(function (a, b) {
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
        renderTabCounts();
        renderList();
      })
      .catch(function (err) {
        if (err.message === "unauthorized") {
          window.location.href = "login.html";
          return;
        }
        listStatus.hidden = false;
        listStatus.textContent = "Не удалось загрузить заказы. Обновите страницу.";
      });
  }

  // Заказ ресторана (оптовый портал) приводим к виду строки общего списка.
  var PORTAL_STATUS = {
    awaiting: "Новый заказ",
    confirmed: "Подтверждён",
    rejected: "Отклонён",
    processing: "В обработке",
    ready: "Готов к выдаче / доставке",
    completed: "Выполнен",
    cancelled: "Отменён",
  };
  // в списке выбора: «Новый заказ», «Подтверждён», «Отменён» (ресторан увидит два последних зелёным / красным);
  // прежние статусы показываются лишь у заказов, которые в них находятся
  function portalSelectStatuses(current) {
    var list = ["awaiting", "confirmed", "cancelled"];
    if (list.indexOf(current) === -1) list.unshift(current);
    return list;
  }
  // цвет выпадающего списка: зелёный — подтверждён, красный — отменён, жёлтый — ждёт
  function portalClass(status) {
    if (status === "confirmed" || status === "completed") return "completed";
    if (status === "cancelled" || status === "rejected") return "new";
    return "processing";
  }
  function portalToRow(o) {
    return {
      portal: true,
      id: o.id,
      number: o.number,
      orderType: "wholesale",
      status: o.status,
      createdAt: o.createdAt,
      restaurantName: o.restaurantName,
      restaurantPhone: o.restaurantPhone,
      totals: o.totals,
      itemsCount: o.items.length,
    };
  }
  // к какой группе фильтра относится статус
  function statusGroup(o) {
    if (!o.portal) return o.status;
    if (o.status === "awaiting") return "new";
    if (o.status === "confirmed" || o.status === "completed") return "completed";
    if (o.status === "rejected" || o.status === "cancelled") return "cancelled";
    return "processing";
  }
  function isNewOrder(o) { return statusGroup(o) === "new"; }

  // счётчики новых заказов на вкладках
  function renderTabCounts() {
    var counts = { all: 0, retail: 0, wholesale: 0 };
    orders.forEach(function (o) {
      if (!isNewOrder(o)) return;
      counts.all++;
      counts[o.orderType === "wholesale" ? "wholesale" : "retail"]++;
    });
    typeTabs.forEach(function (tab) {
      var key = tab.getAttribute("data-type");
      if (!tab.getAttribute("data-label")) tab.setAttribute("data-label", tab.textContent);
      tab.textContent = tab.getAttribute("data-label");
      if (counts[key] > 0) {
        var badge = document.createElement("span");
        badge.className = "tab-count";
        badge.textContent = counts[key];
        tab.appendChild(document.createTextNode(" "));
        tab.appendChild(badge);
      }
    });
  }

  function renderList() {
    orderList.innerHTML = "";

    var byType = orders.filter(function (o) {
      return activeType === "all" || o.orderType === activeType;
    });
    var visible = byType.filter(function (o) {
      return activeFilter === "all" || statusGroup(o) === activeFilter;
    });

    if (!orders.length) {
      listStatus.hidden = false;
      listStatus.textContent = "Заказов пока нет. Как только клиент оформит заказ на сайте, он появится здесь.";
      return;
    }
    if (!byType.length) {
      listStatus.hidden = false;
      listStatus.textContent = activeType === "wholesale" ? "Оптовых заказов пока нет." : "Розничных заказов пока нет.";
      return;
    }
    if (!visible.length) {
      listStatus.hidden = false;
      listStatus.textContent = "В этом статусе заказов нет.";
      return;
    }
    listStatus.hidden = true;

    var fragment = document.createDocumentFragment();
    visible.forEach(function (o) {
      fragment.appendChild(buildRow(o));
    });
    orderList.appendChild(fragment);
  }

  typeTabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      typeTabs.forEach(function (t) {
        t.classList.remove("is-active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("is-active");
      tab.setAttribute("aria-selected", "true");
      activeType = tab.getAttribute("data-type");
      renderList();
    });
  });

  /* ---------------------------------------------------------
     Очистка истории заказов
     --------------------------------------------------------- */
  function clearOrders(mode) {
    var message = mode === "reset"
      ? "Удалить ВСЕ заказы и начать нумерацию заново с №1?\n\nЭто действие нельзя отменить."
      : "Удалить ВСЕ заказы? Нумерация продолжится дальше (следующий заказ получит следующий номер).\n\nЭто действие нельзя отменить.";
    if (!window.confirm(message)) return;

    fetch("/api/admin/orders/clear", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: mode }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Не удалось очистить историю.");
          return data;
        });
      })
      .then(function (data) {
        showToast("История очищена (удалено заказов: " + data.deleted + ")");
        loadOrders();
      })
      .catch(function (err) {
        showToast(err.message, true);
      });
  }

  document.getElementById("clearKeepBtn").addEventListener("click", function () { clearOrders("keep"); });
  document.getElementById("clearResetBtn").addEventListener("click", function () { clearOrders("reset"); });

  function statusOptionsHtml(currentStatus) {
    return STATUS_ORDER.map(function (s) {
      return '<option value="' + s + '"' + (s === currentStatus ? " selected" : "") + '>' + STATUS_LABELS[s] + "</option>";
    }).join("");
  }

  function portalStatusOptions(cur) {
    return portalSelectStatuses(cur).map(function (st) {
      return '<option value="' + st + '"' + (st === cur ? " selected" : "") + ">" + PORTAL_STATUS[st] + "</option>";
    }).join("");
  }

  function buildPortalRow(o) {
    var t = o.totals;
    var row = document.createElement("div");
    row.className = "order-row is-wholesale";
    row.setAttribute("data-id", "p" + o.id);
    row.innerHTML =
      '<div class="order-row-main">' +
        '<p class="order-row-id">Заказ №' + escapeHtml(o.number) + ' <span class="order-type-badge">Опт · ресторан</span></p>' +
        '<p class="order-row-customer">' + escapeHtml(o.restaurantName) + " · " + escapeHtml(o.restaurantPhone) + "</p>" +
        '<p class="order-row-meta">' + t.orderedBlocks + " бл. · " + t.orderedUnits + " шт. · " + formatDate(o.createdAt) + "</p>" +
      "</div>" +
      '<div class="order-row-total">' + formatPrice(t.orderedTotal) + " смн</div>" +
      '<div class="order-row-status">' +
        '<select class="status-select status-' + portalClass(o.status) + '">' + portalStatusOptions(o.status) + "</select>" +
      "</div>" +
      '<div class="order-row-actions">' +
        '<button type="button" class="btn-outline view-btn">Открыть</button>' +
      "</div>";
    var select = row.querySelector(".status-select");
    select.addEventListener("change", function () {
      var prev = o.status;
      AdminShared.api("PATCH", "/api/admin/wholesale-orders/" + o.id, { status: select.value })
        .then(function (updated) {
          o.status = updated.status;
          select.className = "status-select status-" + portalClass(o.status);
          showToast("Статус заказа обновлён");
          renderTabCounts();
          if (activeFilter !== "all") renderList();
        })
        .catch(function (err) {
          select.value = prev;
          showToast(err.message, true);
        });
    });
    row.querySelector(".view-btn").addEventListener("click", function () { openPortalOrder(o.id); });
    row.addEventListener("dblclick", function () { openPortalOrder(o.id); });
    return row;
  }

  function buildRow(o) {
    if (o.portal) return buildPortalRow(o);
    var row = document.createElement("div");
    row.className = "order-row" + (o.orderType === "wholesale" ? " is-wholesale" : "");
    row.setAttribute("data-id", o.id);

    var isWholesale = o.orderType === "wholesale";
    var typeBadge = isWholesale ? '<span class="order-type-badge">Опт</span>' : "";
    var customerLine = isWholesale
      ? escapeHtml(o.companyName || "—") + " · " + escapeHtml(o.customerName)
      : escapeHtml(o.customerName) + " · " + escapeHtml(o.customerPhone);

    row.innerHTML =
      '<div class="order-row-main">' +
        '<p class="order-row-id">Заказ №' + (o.number || o.id) + " " + typeBadge + "</p>" +
        '<p class="order-row-customer">' + customerLine + "</p>" +
        '<p class="order-row-meta">' + o.itemsCount + " поз. · " + formatDate(o.createdAt) + "</p>" +
      "</div>" +
      '<div class="order-row-total">' + formatPrice(o.totalAmount) + " смн</div>" +
      '<div class="order-row-status">' +
        '<select class="status-select status-' + o.status + '">' + statusOptionsHtml(o.status) + "</select>" +
      "</div>" +
      '<div class="order-row-actions">' +
        '<button type="button" class="btn-outline view-btn">Открыть</button>' +
      "</div>";

    var select = row.querySelector(".status-select");
    select.addEventListener("change", function () {
      updateStatus(o, select.value, select);
    });
    row.querySelector(".view-btn").addEventListener("click", function () {
      openOrderDetail(o);
    });

    return row;
  }

  filterPills.forEach(function (pill) {
    pill.addEventListener("click", function () {
      filterPills.forEach(function (p) { p.classList.remove("is-active"); });
      pill.classList.add("is-active");
      activeFilter = pill.getAttribute("data-filter");
      renderList();
    });
  });

  /* ---------------------------------------------------------
     Смена статуса заказа
     --------------------------------------------------------- */
  function updateStatus(order, newStatus, selectEl) {
    var prevStatus = order.status;

    fetch("/api/admin/orders/" + order.id + "/status", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Не удалось изменить статус.");
          return data;
        });
      })
      .then(function (updated) {
        order.status = updated.status;
        if (selectEl) selectEl.className = "status-select status-" + updated.status;
        showToast("Статус заказа обновлён");
        if (activeFilter !== "all") renderList(); // заказ мог "уйти" из текущей вкладки фильтра
      })
      .catch(function (err) {
        if (selectEl) selectEl.value = prevStatus;
        showToast(err.message, true);
      });
  }

  /* ---------------------------------------------------------
     Детали заказа
     --------------------------------------------------------- */
  var overlay = document.getElementById("orderModalOverlay");
  var modalTitle = document.getElementById("orderModalTitle");
  var orderDetail = document.getElementById("orderDetail");

  function openOrderDetail(order) {
    modalTitle.textContent = "Заказ №" + (order.number || order.id) + (order.orderType === "wholesale" ? " · оптовый" : "");
    orderDetail.innerHTML = '<p class="list-status">Загружаем…</p>';
    overlay.hidden = false;

    fetch("/api/admin/orders/" + order.id, { credentials: "same-origin" })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Не удалось загрузить заказ.");
          return data;
        });
      })
      .then(renderOrderDetail)
      .catch(function (err) {
        orderDetail.innerHTML = '<p class="form-error">' + escapeHtml(err.message) + "</p>";
      });
  }

  function renderOrderDetail(o) {
    var itemsHtml = o.items
      .map(function (it) {
        return (
          '<div class="order-item-row">' +
            '<span class="order-item-name">' + escapeHtml(it.productName) + "</span>" +
            '<span class="order-item-qty">\u00d7 ' + it.quantity + "</span>" +
            '<span class="order-item-subtotal">' + formatPrice(it.subtotal) + " смн</span>" +
          "</div>"
        );
      })
      .join("");

    var isWholesale = o.orderType === "wholesale";

    orderDetail.innerHTML =
      '<div class="order-detail-section">' +
        "<h4>" + (isWholesale ? "Ресторан / компания" : "Клиент") + "</h4>" +
        (isWholesale
          ? "<p><strong>" + escapeHtml(o.companyName || "—") + "</strong></p><p>Контакт: " + escapeHtml(o.customerName) + "</p>"
          : "<p><strong>" + escapeHtml(o.customerName) + "</strong></p>") +
        "<p>" + escapeHtml(o.customerPhone) + "</p>" +
        (o.customerAddress
          ? "<p>" + escapeHtml(o.customerAddress) + "</p>"
          : '<p class="order-detail-muted">Самовывоз (адрес не указан)</p>') +
        (o.comment ? '<p class="order-detail-comment">«' + escapeHtml(o.comment) + "»</p>" : "") +
      "</div>" +
      '<div class="order-detail-section">' +
        "<h4>Состав заказа</h4>" +
        '<div class="order-items">' + itemsHtml + "</div>" +
        '<div class="order-detail-total">Итого: <strong>' + formatPrice(o.totalAmount) + " сомони</strong></div>" +
      "</div>" +
      '<div class="order-detail-section">' +
        "<h4>Статус</h4>" +
        '<select class="status-select status-' + o.status + '" id="orderDetailStatus">' + statusOptionsHtml(o.status) + "</select>" +
      "</div>" +
      '<p class="order-detail-date">Оформлен: ' + formatDate(o.createdAt) + "</p>";

    var detailSelect = document.getElementById("orderDetailStatus");
    detailSelect.addEventListener("change", function () {
      updateStatus(o, detailSelect.value, detailSelect);
      var idx = orders.findIndex(function (x) { return x.id === o.id; });
      if (idx !== -1) orders[idx].status = detailSelect.value;
    });
  }

  /* ---------------------------------------------------------
     Заказ ресторана: подтверждение количества, статус, печать
     --------------------------------------------------------- */
  var S = window.AdminShared;
  var woOverlay = document.getElementById("woModalOverlay");
  var woBody = document.getElementById("woModalBody");

  function printLink(o, mode, label) {
    return '<a class="btn-outline adm-link-btn" target="_blank" rel="noopener" href="../print-order.html?id=' +
      o.id + "&src=admin&mode=" + mode + '">' + label + "</a>";
  }

  function openPortalOrder(id) {
    woBody.innerHTML = '<p class="list-status">Загружаем…</p>';
    woOverlay.hidden = false;
    S.api("GET", "/api/admin/wholesale-orders/" + id).then(renderPortalOrder).catch(function (err) {
      woBody.innerHTML = '<p class="form-error">' + escapeHtml(err.message) + "</p>";
    });
  }

  function renderPortalOrder(o) {
    document.getElementById("woModalTitle").textContent = "Заказ №" + o.number;
    var t = o.totals;
    var esc = S.esc, money = S.money;

    var rows = o.items.map(function (it) {
      return "<tr>" +
        "<td>" + esc(it.productName) + "<br><small>блок = " + it.unitsPerBlock + " шт.</small></td>" +
        '<td class="num">' + it.orderedBlocks + "</td>" +
        '<td class="num">' + it.orderedUnits + "</td>" +
        '<td class="num">' + money(it.pricePerBlock) + "</td>" +
        '<td class="num">' + money(it.orderedSubtotal) + "</td>" +
      "</tr>";
    }).join("");

    woBody.innerHTML =
      '<p><span class="adm-badge st-' + o.status + '">' + PORTAL_STATUS[o.status] + "</span></p>" +
      '<div class="adm-note"><b>' + esc(o.restaurantName) + "</b><br>Телефон: " + esc(o.restaurantPhone) +
        "<br>Адрес: " + esc(o.restaurantAddress) + "<br>Дата: " + S.fmtDate(o.createdAt) +
        (o.customerComment ? "<br>Комментарий ресторана: " + esc(o.customerComment) : "") + "</div>" +
      '<div class="adm-table-wrap"><table class="adm-table"><thead><tr>' +
        "<th>Товар</th><th>Заказано блоков</th><th>Штук</th><th>Цена/блок</th><th>Сумма</th>" +
      "</tr></thead><tbody>" + rows + "</tbody><tfoot><tr><td>Всего</td>" +
        '<td class="num">' + t.orderedBlocks + '</td><td class="num">' + t.orderedUnits + "</td><td></td>" +
        '<td class="num">' + money(t.orderedTotal) + "</td></tr></tfoot></table></div>" +
      '<div class="adm-form">' +
        '<label class="field"><span class="field-label">Статус</span><select id="woStatus">' + portalStatusOptions(o.status) + "</select></label>" +
      "</div>" +
      '<p class="form-error" id="woError" hidden></p>' +
      '<div class="adm-actions">' +
        '<button type="button" class="btn-primary" id="woConfirm">Подтвердить заказ</button>' +
        '<button type="button" class="btn-outline btn-danger" id="woCancel">Отменить заказ</button>' +
      "</div>" +
      '<div class="adm-actions">' +
        printLink(o, "print", "Печать / PDF") +
        printLink(o, "warehouse", "Печать для склада") +
      "</div>";

    function save(payload, okMsg) {
      var errBox = document.getElementById("woError");
      errBox.hidden = true;
      S.api("PATCH", "/api/admin/wholesale-orders/" + o.id, payload)
        .then(function (updated) {
          showToast(okMsg);
          loadOrders();
          renderPortalOrder(updated);
        })
        .catch(function (err) {
          errBox.textContent = err.message;
          errBox.hidden = false;
        });
    }

    document.getElementById("woStatus").addEventListener("change", function () {
      save({ status: this.value }, "Статус заказа обновлён");
    });
    document.getElementById("woCancel").addEventListener("click", function () {
      if (!window.confirm("Отменить заказ №" + o.number + "? Ресторан увидит, что заказ отменён.")) return;
      save({
        status: "cancelled",
      }, "Заказ отменён");
    });
    document.getElementById("woConfirm").addEventListener("click", function () {
      save({
        status: "confirmed",
      }, "Заказ подтверждён");
    });
  }

  document.getElementById("woModalClose").addEventListener("click", function () { woOverlay.hidden = true; });
  woOverlay.addEventListener("click", function (e) { if (e.target === woOverlay) woOverlay.hidden = true; });

  document.getElementById("orderModalClose").addEventListener("click", function () {
    overlay.hidden = true;
  });
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) overlay.hidden = true;
  });

  /* ---------------------------------------------------------
     Смена пароля (тот же функционал, что и на странице товаров)
     --------------------------------------------------------- */
  var pwOverlay = document.getElementById("passwordModalOverlay");
  var pwForm = document.getElementById("passwordForm");
  var pwError = document.getElementById("passwordFormError");

  document.getElementById("changePasswordBtn").addEventListener("click", function () {
    pwForm.reset();
    pwError.hidden = true;
    pwOverlay.hidden = false;
  });
  document.getElementById("passwordModalClose").addEventListener("click", function () {
    pwOverlay.hidden = true;
  });
  document.getElementById("passwordCancelBtn").addEventListener("click", function () {
    pwOverlay.hidden = true;
  });
  pwOverlay.addEventListener("click", function (e) {
    if (e.target === pwOverlay) pwOverlay.hidden = true;
  });

  pwForm.addEventListener("submit", function (e) {
    e.preventDefault();
    pwError.hidden = true;

    var currentPassword = document.getElementById("currentPassword").value;
    var newPassword = document.getElementById("newPassword").value;

    fetch("/api/auth/change-password", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: currentPassword, newPassword: newPassword }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Не удалось сменить пароль.");
          return data;
        });
      })
      .then(function (data) {
        pwOverlay.hidden = true;
        if (adminUser && data.username) adminUser.textContent = data.username;
        showToast("Пароль изменён");
      })
      .catch(function (err) {
        pwError.textContent = err.message;
        pwError.hidden = false;
      });
  });
})();
