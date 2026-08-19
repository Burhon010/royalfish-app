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
      hour: "2-digit", minute: "2-digit",
    });
  }

  /* ---------------------------------------------------------
     Загрузка и рендер списка заказов
     --------------------------------------------------------- */
  function loadOrders() {
    listStatus.hidden = false;
    listStatus.textContent = "Загружаем заказы…";
    fetch("/api/admin/orders", { credentials: "same-origin" })
      .then(function (res) {
        if (res.status === 401) throw new Error("unauthorized");
        if (!res.ok) throw new Error("Ошибка сети");
        return res.json();
      })
      .then(function (data) {
        orders = data;
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

  function renderList() {
    orderList.innerHTML = "";

    var byType = orders.filter(function (o) {
      return activeType === "all" || o.orderType === activeType;
    });
    var visible = byType.filter(function (o) {
      return activeFilter === "all" || o.status === activeFilter;
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

  function statusOptionsHtml(currentStatus) {
    return STATUS_ORDER.map(function (s) {
      return '<option value="' + s + '"' + (s === currentStatus ? " selected" : "") + '>' + STATUS_LABELS[s] + "</option>";
    }).join("");
  }

  function buildRow(o) {
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
        '<p class="order-row-id">Заказ №' + o.id + " " + typeBadge + "</p>" +
        '<p class="order-row-customer">' + customerLine + "</p>" +
        '<p class="order-row-meta">' + o.itemsCount + " поз. · " + formatDate(o.createdAt) + "</p>" +
      "</div>" +
      '<div class="order-row-total">' + formatPrice(o.totalAmount) + " смн</div>" +
      '<div class="order-row-status">' +
        '<select class="status-select status-' + o.status + '">' + statusOptionsHtml(o.status) + "</select>" +
      "</div>" +
      '<div class="order-row-actions">' +
        '<button type="button" class="icon-btn view-btn" title="Подробнее">&#128065;</button>' +
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
    modalTitle.textContent = "Заказ №" + order.id + (order.orderType === "wholesale" ? " · оптовый" : "");
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
      .then(function () {
        pwOverlay.hidden = true;
        showToast("Пароль изменён");
      })
      .catch(function (err) {
        pwError.textContent = err.message;
        pwError.hidden = false;
      });
  });
})();
