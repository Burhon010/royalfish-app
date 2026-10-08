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

  var groups = [];
  var restaurantId = Number(new URLSearchParams(window.location.search).get("id"));
  var restBody = document.getElementById("restPage");

  S.init(function () {
    if (!restaurantId) {
      restBody.innerHTML = '<p class="form-error">Ресторан не указан. <a href="restaurants.html">Вернуться к списку</a></p>';
      return;
    }
    api("GET", "/api/admin/price-groups").then(function (g) {
      groups = g;
      return load(window.location.hash === "#prices");
    });
  });

  function load(scrollToPrices) {
    return api("GET", "/api/admin/restaurants/" + restaurantId)
      .then(function (r) {
        renderRestaurant(r);
        if (scrollToPrices) {
          var h = document.getElementById("restPricesTitle");
          if (h) h.scrollIntoView();
        }
      })
      .catch(function (err) {
        if (err.message === "unauthorized") return;
        restBody.innerHTML = '<p class="form-error">' + esc(err.message) + ' <a href="restaurants.html">Вернуться к списку</a></p>';
      });
  }

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

  function priceRow(r, p) {
    return '<tr class="' + (p.hidden ? "row-hidden" : "") + '">' +
      '<td><label class="vis-toggle"><input type="checkbox" class="vis-input" data-id="' + p.productId + '"' +
        (p.hidden ? "" : " checked") + "> <span>" + (p.hidden ? "скрыт" : "виден") + "</span></label></td>" +
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
    document.getElementById("restPageTitle").textContent = r.name;
    document.title = r.name + " — рестораны — панель управления Royal Fish";

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

    // разделы свёрнуты по умолчанию; при перерисовке запоминаем, что было открыто
    var hadSections = !!document.getElementById("secData");
    var openData = hadSections ? !!document.querySelector("#secData[open]") : false;
    var openPrices = hadSections ? !!document.querySelector("#secPrices[open]") : window.location.hash === "#prices";

    restBody.innerHTML =
      '<p><span class="adm-badge st-' + r.status + '">' + STATUS[r.status] + "</span> &nbsp; Регистрация: " + S.fmtDate(r.createdAt) +
      " · Оптовых заказов: " + r.ordersCount + "</p>" +
      '<div class="adm-actions">' + quick +
        '<button type="button" class="btn-primary btn-enter" id="enterBtn">Зайти в кабинет ресторана</button>' +
        '<button type="button" class="btn-outline btn-danger" id="deleteRestBtn">Удалить ресторан</button></div>' +
      '<details class="rest-sec" id="secData"' + (openData ? " open" : "") + "><summary>Данные ресторана</summary>" +
      '<form class="adm-form" id="restForm" novalidate>' +
        '<label class="field"><span class="field-label">Название</span><input type="text" id="rName" maxlength="100" value="' + esc(r.name) + '"></label>' +
        '<label class="field"><span class="field-label">Телефон</span><input type="text" id="rPhone" maxlength="40" value="' + esc(r.phone) + '"></label>' +
        '<label class="field field--full"><span class="field-label">Адрес</span><input type="text" id="rAddress" maxlength="300" value="' + esc(r.address) + '"></label>' +
        '<label class="field"><span class="field-label">Статус</span><select id="rStatus">' + statusOptions(r.status) + "</select></label>" +
        '<label class="field"><span class="field-label">Группа цен</span><select id="rGroup">' + groupOptions(r.priceGroupId) + "</select></label>" +
        '<div class="field field--full"><span class="field-label">Текущий пароль ресторана</span>' +
          (r.password
            ? '<div class="pw-reveal"><code id="rPwShown">••••••••</code> ' +
              '<button type="button" class="adm-small-btn" id="rPwToggle">Показать</button></div>'
            : '<div class="pw-reveal"><small>Не сохранён (ресторан зарегистрирован раньше). Задайте новый пароль ниже — он будет виден здесь.</small></div>') +
        "</div>" +
        '<label class="field field--full"><span class="field-label">Новый пароль (необязательно, минимум 8 символов)</span>' +
        '<input type="text" id="rPassword" autocomplete="off" minlength="8"></label>' +
        '<p class="form-error field--full" id="rError" hidden></p>' +
        '<div class="field--full"><button type="submit" class="btn-primary">Сохранить данные</button></div>' +
      "</form></details>" +
      '<details class="rest-sec" id="secPrices"' + (openPrices ? " open" : "") + '><summary id="restPricesTitle">Цены и товары</summary>' +
      '<div class="adm-table-wrap"><table class="adm-table"><thead><tr>' +
        "<th>Для ресторана</th><th>Товар</th><th>Базовая</th><th>Группа</th><th>Индивидуальная</th><th>Итоговая</th><th></th>" +
      "</tr></thead><tbody>" +
      (r.prices.length ? r.prices.map(function (p) { return priceRow(r, p); }).join("") :
        '<tr><td colspan="7">Нет оптовых товаров. Включите «оптовый каталог» и оптовую цену у товара в разделе «Товары».</td></tr>') +
      "</tbody></table></div></details>";

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

    var pwToggle = document.getElementById("rPwToggle");
    if (pwToggle) {
      var pwShown = false;
      pwToggle.addEventListener("click", function () {
        pwShown = !pwShown;
        document.getElementById("rPwShown").textContent = pwShown ? r.password : "••••••••";
        pwToggle.textContent = pwShown ? "Скрыть" : "Показать";
      });
    }

    Array.prototype.forEach.call(restBody.querySelectorAll(".q-act"), function (b) {
      b.addEventListener("click", function () {
        saveRestaurant(r.id, { status: b.getAttribute("data-s") });
      });
    });

    document.getElementById("deleteRestBtn").addEventListener("click", function () {
      var msg = "Удалить ресторан «" + r.name + "»?\n\nАккаунт, индивидуальные цены и настройки товаров будут удалены. Оптовые заказы останутся в истории. Это действие нельзя отменить.";
      if (!window.confirm(msg)) return;
      api("DELETE", "/api/admin/restaurants/" + r.id)
        .then(function () { window.location.href = "restaurants.html"; })
        .catch(function (err) { S.showToast(err.message, true); });
    });

    document.getElementById("enterBtn").addEventListener("click", function () {
      // окно открываем сразу по клику (иначе браузер заблокирует всплывающее окно)
      var w = window.open("", "_blank");
      api("POST", "/api/admin/restaurants/" + r.id + "/enter")
        .then(function () {
          var url = "../portal.html?admin=" + r.id;
          if (w) w.location.href = url;
          else window.location.href = url;
        })
        .catch(function (err) {
          if (w) w.close();
          S.showToast(err.message, true);
        });
    });

    Array.prototype.forEach.call(restBody.querySelectorAll(".vis-input"), function (cb) {
      cb.addEventListener("change", function () {
        var visible = cb.checked;
        api("PUT", "/api/admin/restaurants/" + r.id + "/products/" + cb.getAttribute("data-id"), { visible: visible })
          .then(function () {
            S.showToast(visible ? "Товар снова виден ресторану" : "Товар скрыт для ресторана");
            load(true);
          })
          .catch(function (err) {
            cb.checked = !visible;
            S.showToast(err.message, true);
          });
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
            load(true);
          })
          .catch(function (err) { S.showToast(err.message, true); });
      });
    });
    Array.prototype.forEach.call(restBody.querySelectorAll(".clear-price"), function (b) {
      b.addEventListener("click", function () {
        api("DELETE", "/api/admin/restaurants/" + r.id + "/prices/" + b.getAttribute("data-id"))
          .then(function () {
            S.showToast("Возвращена цена группы");
            load(true);
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
        return api("GET", "/api/admin/price-groups").then(function (g) { groups = g; return load(false); });
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

})();
