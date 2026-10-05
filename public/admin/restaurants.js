(function () {
  "use strict";

  var S = window.AdminShared;
  var esc = S.esc, money = S.money, api = S.api;

  var STATUS = {
    pending: "На рассмотрении",
    approved: "Одобрен",
    rejected: "Отклонён",
    blocked: "Заблокирован",
  };

  var restaurants = [];
  var groups = [];

  var listEl = document.getElementById("restList");
  var listStatus = document.getElementById("listStatus");
  var restOverlay = document.getElementById("restModalOverlay");
  var restBody = document.getElementById("restModalBody");
  var groupsOverlay = document.getElementById("groupsModalOverlay");
  var groupsBody = document.getElementById("groupsModalBody");

  S.init(function () {
    loadGroups().then(loadRestaurants);
  });

  /* ---------------- список ---------------- */
  function loadGroups() {
    return api("GET", "/api/admin/price-groups").then(function (g) { groups = g; });
  }

  function loadRestaurants() {
    return api("GET", "/api/admin/restaurants")
      .then(function (list) {
        restaurants = list;
        renderList();
      })
      .catch(function (err) {
        if (err.message === "unauthorized") return;
        listStatus.hidden = false;
        listStatus.textContent = "Не удалось загрузить рестораны. Обновите страницу.";
      });
  }

  function renderList() {
    var visible = restaurants;
    listEl.innerHTML = "";
    if (!restaurants.length) {
      listEl.innerHTML = '<p class="list-status">Пока нет зарегистрированных ресторанов.</p>';
      return;
    }
    if (!visible.length) {
      listEl.innerHTML = '<p class="list-status">В этом статусе ресторанов нет.</p>';
      return;
    }
    visible.forEach(function (r, index) {
      var row = document.createElement("div");
      row.className = "rest-row";
      row.setAttribute("tabindex", "0");
      row.setAttribute("role", "button");
      row.innerHTML =
        '<div class="rest-row-num">' + (index + 1) + "</div>" +
        '<div class="rest-row-main"><p class="rest-row-name">' + esc(r.name) + "</p>" +
        '<p class="rest-row-meta">' + esc(r.phone) + " · " + esc(r.address) + "</p></div>" +
        '<div><p class="rest-row-meta">Регистрация: ' + S.fmtDate(r.createdAt) + "</p>" +
        '<p class="rest-row-meta">Группа: ' + (r.priceGroupName ? esc(r.priceGroupName) : "—") + "</p></div>" +
        '<div class="rest-row-right">' + r.ordersCount + " опт. заказ(ов)</div>" +
        '<div><span class="adm-badge st-' + r.status + '">' + STATUS[r.status] + "</span></div>" +
        '<div><button type="button" class="btn-primary rest-prices-btn">Цены</button></div>';
      row.addEventListener("click", function (e) {
        openRestaurant(r.id, !!e.target.closest(".rest-prices-btn"));
      });
      row.addEventListener("keydown", function (e) {
        if (e.key === "Enter") openRestaurant(r.id, false);
      });
      listEl.appendChild(row);
    });
  }

  /* ---------------- карточка ресторана ---------------- */
  function groupOptions(selectedId) {
    return '<option value="">— без группы —</option>' + groups.map(function (g) {
      return '<option value="' + g.id + '"' + (g.id === selectedId ? " selected" : "") + ">" + esc(g.name) + "</option>";
    }).join("");
  }
  function statusOptions(current) {
    return Object.keys(STATUS).map(function (s) {
      return '<option value="' + s + '"' + (s === current ? " selected" : "") + ">" + STATUS[s] + "</option>";
    }).join("");
  }

  function openRestaurant(id, scrollToPrices) {
    restBody.innerHTML = '<p class="list-status">Загружаем…</p>';
    restOverlay.hidden = false;
    api("GET", "/api/admin/restaurants/" + id).then(function (r) {
      renderRestaurant(r);
      if (scrollToPrices) {
        var h = document.getElementById("restPricesTitle");
        if (h) h.scrollIntoView();
      }
    }).catch(function (err) {
      restBody.innerHTML = '<p class="form-error">' + esc(err.message) + "</p>";
    });
  }

  function priceRow(r, p) {
    return "<tr>" +
      "<td>" + esc(p.name) + "<br><small>" + esc(p.weight) + " · блок " + p.unitsPerBlock + " шт.</small></td>" +
      '<td class="num">' + money(p.basePrice) + "</td>" +
      '<td class="num">' + (p.groupPrice === null ? "—" : money(p.groupPrice)) + "</td>" +
      '<td><input type="number" min="0" step="0.01" class="adm-inline-input own-input" data-id="' + p.productId + '" value="' +
        (p.ownPrice === null ? "" : p.ownPrice) + '" placeholder="—"></td>' +
      '<td class="num"><b>' + money(p.finalPrice) + "</b></td>" +
      "<td>" +
        '<button type="button" class="adm-small-btn save-price" data-id="' + p.productId + '">Сохранить</button> ' +
        '<button type="button" class="adm-small-btn danger clear-price" data-id="' + p.productId + '"' + (p.ownPrice === null ? " disabled" : "") + ">Сбросить</button>" +
      "</td></tr>";
  }

  function renderRestaurant(r) {
    document.getElementById("restModalTitle").textContent = r.name;

    var quick = "";
    if (r.status === "pending") {
      quick = '<button type="button" class="btn-primary q-act" data-s="approved">Одобрить</button>' +
              '<button type="button" class="btn-outline q-act" data-s="rejected">Отклонить</button>';
    } else if (r.status === "approved") {
      quick = '<button type="button" class="btn-outline q-act" data-s="blocked">Заблокировать</button>';
    } else if (r.status === "blocked") {
      quick = '<button type="button" class="btn-primary q-act" data-s="approved">Разблокировать</button>';
    } else if (r.status === "rejected") {
      quick = '<button type="button" class="btn-primary q-act" data-s="approved">Одобрить</button>';
    }

    restBody.innerHTML =
      '<p><span class="adm-badge st-' + r.status + '">' + STATUS[r.status] + "</span> &nbsp; Регистрация: " + S.fmtDate(r.createdAt) +
      " · Оптовых заказов: " + r.ordersCount + "</p>" +
      '<div class="adm-actions">' + quick + "</div>" +
      '<form class="adm-form" id="restForm" novalidate>' +
        '<label class="field"><span class="field-label">Название</span><input type="text" id="rName" maxlength="100" value="' + esc(r.name) + '"></label>' +
        '<label class="field"><span class="field-label">Телефон</span><input type="text" id="rPhone" maxlength="40" value="' + esc(r.phone) + '"></label>' +
        '<label class="field field--full"><span class="field-label">Адрес</span><input type="text" id="rAddress" maxlength="300" value="' + esc(r.address) + '"></label>' +
        '<label class="field"><span class="field-label">Статус</span><select id="rStatus">' + statusOptions(r.status) + "</select></label>" +
        '<label class="field"><span class="field-label">Группа цен</span><select id="rGroup">' + groupOptions(r.priceGroupId) + "</select></label>" +
        '<label class="field field--full"><span class="field-label">Новый пароль (необязательно, минимум 8 символов)</span>' +
        '<input type="text" id="rPassword" autocomplete="off" minlength="8"></label>' +
        '<p class="form-error field--full" id="rError" hidden></p>' +
        '<div class="field--full"><button type="submit" class="btn-primary">Сохранить данные</button></div>' +
      "</form>" +
      '<h3 class="adm-h3" id="restPricesTitle">Цены ресторана «' + esc(r.name) + '» (за блок)</h3>' +
      '<div class="adm-note">Итоговая цена ресторана: 1) индивидуальная, 2) цена группы, 3) базовая оптовая. Изменение группы применяется после «Сохранить данные».</div>' +
      '<div class="adm-table-wrap"><table class="adm-table"><thead><tr>' +
        "<th>Товар</th><th>Базовая</th><th>Группа</th><th>Индивидуальная</th><th>Итоговая</th><th></th>" +
      "</tr></thead><tbody>" +
      (r.prices.length ? r.prices.map(function (p) { return priceRow(r, p); }).join("") :
        '<tr><td colspan="6">Нет оптовых товаров. Включите «оптовый каталог» и оптовую цену у товара в разделе «Товары».</td></tr>') +
      "</tbody></table></div>";

    document.getElementById("restForm").addEventListener("submit", function (e) {
      e.preventDefault();
      saveRestaurant(r.id, {
        name: document.getElementById("rName").value,
        phone: document.getElementById("rPhone").value,
        address: document.getElementById("rAddress").value,
        status: document.getElementById("rStatus").value,
        priceGroupId: document.getElementById("rGroup").value || null,
        newPassword: document.getElementById("rPassword").value || undefined,
      });
    });

    Array.prototype.forEach.call(restBody.querySelectorAll(".q-act"), function (b) {
      b.addEventListener("click", function () {
        saveRestaurant(r.id, { status: b.getAttribute("data-s") });
      });
    });

    Array.prototype.forEach.call(restBody.querySelectorAll(".save-price"), function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-id");
        var input = restBody.querySelector('.own-input[data-id="' + id + '"]');
        if (input.value === "") {
          S.showToast("Введите цену или нажмите «Сбросить».", true);
          return;
        }
        api("PUT", "/api/admin/restaurants/" + r.id + "/prices/" + id, { price: Number(input.value) })
          .then(function () {
            S.showToast("Индивидуальная цена сохранена");
            openRestaurant(r.id, true);
          })
          .catch(function (err) { S.showToast(err.message, true); });
      });
    });
    Array.prototype.forEach.call(restBody.querySelectorAll(".clear-price"), function (b) {
      b.addEventListener("click", function () {
        api("DELETE", "/api/admin/restaurants/" + r.id + "/prices/" + b.getAttribute("data-id"))
          .then(function () {
            S.showToast("Возвращена цена группы");
            openRestaurant(r.id, true);
          })
          .catch(function (err) { S.showToast(err.message, true); });
      });
    });
  }

  function saveRestaurant(id, changes) {
    var errBox = document.getElementById("rError");
    if (errBox) errBox.hidden = true;
    api("PATCH", "/api/admin/restaurants/" + id, changes)
      .then(function () {
        S.showToast("Сохранено");
        return Promise.all([loadGroups(), loadRestaurants()]).then(function () { openRestaurant(id); });
      })
      .catch(function (err) {
        if (errBox) {
          errBox.textContent = err.message;
          errBox.hidden = false;
        } else {
          S.showToast(err.message, true);
        }
      });
  }

  document.getElementById("restModalClose").addEventListener("click", function () { restOverlay.hidden = true; });
  restOverlay.addEventListener("click", function (e) { if (e.target === restOverlay) restOverlay.hidden = true; });

  /* ---------------- группы цен ---------------- */
  var selectedGroupId = null;

  document.getElementById("groupsBtn").addEventListener("click", function () {
    groupsOverlay.hidden = false;
    loadGroups().then(renderGroups);
  });
  document.getElementById("groupsModalClose").addEventListener("click", function () {
    groupsOverlay.hidden = true;
    loadRestaurants();
  });
  groupsOverlay.addEventListener("click", function (e) {
    if (e.target === groupsOverlay) {
      groupsOverlay.hidden = true;
      loadRestaurants();
    }
  });

  function renderGroups() {
    if (selectedGroupId && !groups.some(function (g) { return g.id === selectedGroupId; })) selectedGroupId = null;

    var rows = groups.map(function (g) {
      return '<div class="group-row" data-id="' + g.id + '">' +
        '<input type="text" class="adm-inline-input g-name" maxlength="40" value="' + esc(g.name) + '">' +
        '<span class="rest-row-meta">' + g.restaurantsCount + " рест.</span>" +
        '<button type="button" class="adm-small-btn g-save">Переименовать</button>' +
        '<button type="button" class="adm-small-btn g-prices">Цены</button>' +
        '<button type="button" class="adm-small-btn danger g-del">Удалить</button>' +
      "</div>";
    }).join("");

    groupsBody.innerHTML =
      (rows || '<p class="list-status">Групп пока нет.</p>') +
      '<form class="group-row" id="groupAddForm"><input type="text" class="adm-inline-input" id="groupNewName" maxlength="40" placeholder="Новая группа (например, Gold)" required>' +
      '<button type="submit" class="btn-primary">Добавить</button></form>' +
      '<p class="form-error" id="groupError" hidden></p>' +
      '<div id="groupPrices"></div>';

    document.getElementById("groupAddForm").addEventListener("submit", function (e) {
      e.preventDefault();
      api("POST", "/api/admin/price-groups", { name: document.getElementById("groupNewName").value })
        .then(function (g) {
          selectedGroupId = g.id;
          return loadGroups();
        })
        .then(renderGroups)
        .catch(groupError);
    });

    Array.prototype.forEach.call(groupsBody.querySelectorAll(".group-row[data-id]"), function (row) {
      var id = Number(row.getAttribute("data-id"));
      row.querySelector(".g-save").addEventListener("click", function () {
        api("PATCH", "/api/admin/price-groups/" + id, { name: row.querySelector(".g-name").value })
          .then(function () { S.showToast("Название изменено"); return loadGroups(); })
          .then(renderGroups)
          .catch(groupError);
      });
      row.querySelector(".g-prices").addEventListener("click", function () {
        selectedGroupId = id;
        renderGroupPrices();
      });
      row.querySelector(".g-del").addEventListener("click", function () {
        if (!window.confirm("Удалить группу? Рестораны этой группы перейдут на базовые цены, цены группы будут удалены.")) return;
        api("DELETE", "/api/admin/price-groups/" + id)
          .then(function () { S.showToast("Группа удалена"); return loadGroups(); })
          .then(renderGroups)
          .catch(groupError);
      });
    });

    if (selectedGroupId) renderGroupPrices();
  }

  function groupError(err) {
    var box = document.getElementById("groupError");
    box.textContent = err.message;
    box.hidden = false;
  }

  function renderGroupPrices() {
    var box = document.getElementById("groupPrices");
    var g = groups.filter(function (x) { return x.id === selectedGroupId; })[0];
    if (!g) { box.innerHTML = ""; return; }
    box.innerHTML = '<p class="list-status">Загружаем цены…</p>';

    api("GET", "/api/admin/price-groups/" + g.id + "/prices").then(function (rows) {
      box.innerHTML =
        '<h3 class="adm-h3">Цены группы «' + esc(g.name) + "» (за блок)</h3>" +
        '<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Товар</th><th>Базовая</th><th>Цена группы</th><th></th></tr></thead><tbody>' +
        (rows.length ? rows.map(function (p) {
          return "<tr><td>" + esc(p.name) + "<br><small>" + esc(p.weight) + " · блок " + p.unitsPerBlock + " шт.</small></td>" +
            '<td class="num">' + money(p.basePrice) + "</td>" +
            '<td><input type="number" min="0" step="0.01" class="adm-inline-input gp-input" data-id="' + p.productId + '" value="' +
              (p.groupPrice === null ? "" : p.groupPrice) + '" placeholder="—"></td>' +
            '<td><button type="button" class="adm-small-btn gp-save" data-id="' + p.productId + '">Сохранить</button> ' +
            '<button type="button" class="adm-small-btn danger gp-clear" data-id="' + p.productId + '"' + (p.groupPrice === null ? " disabled" : "") + ">Сбросить</button></td></tr>";
        }).join("") : '<tr><td colspan="4">Нет оптовых товаров.</td></tr>') +
        "</tbody></table></div>";

      Array.prototype.forEach.call(box.querySelectorAll(".gp-save"), function (b) {
        b.addEventListener("click", function () {
          var pid = b.getAttribute("data-id");
          var input = box.querySelector('.gp-input[data-id="' + pid + '"]');
          if (input.value === "") { S.showToast("Введите цену или нажмите «Сбросить».", true); return; }
          api("PUT", "/api/admin/price-groups/" + g.id + "/prices/" + pid, { price: Number(input.value) })
            .then(function () { S.showToast("Цена группы сохранена"); renderGroupPrices(); })
            .catch(function (err) { S.showToast(err.message, true); });
        });
      });
      Array.prototype.forEach.call(box.querySelectorAll(".gp-clear"), function (b) {
        b.addEventListener("click", function () {
          api("DELETE", "/api/admin/price-groups/" + g.id + "/prices/" + b.getAttribute("data-id"))
            .then(function () { S.showToast("Цена группы удалена"); renderGroupPrices(); })
            .catch(function (err) { S.showToast(err.message, true); });
        });
      });
    }).catch(function (err) {
      box.innerHTML = '<p class="form-error">' + esc(err.message) + "</p>";
    });
  }
})();
