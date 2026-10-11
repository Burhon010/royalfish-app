(function () {
  "use strict";

  var S = window.AdminShared;
  var esc = S.esc, api = S.api;

  var STATUS = {
    pending: "На рассмотрении",
    approved: "Одобрен",
    rejected: "Отклонён",
    blocked: "Заблокирован",
  };

  var collapsed = false;
  var restaurantId = Number(new URLSearchParams(window.location.search).get("id"));
  var restBody = document.getElementById("restPage");

  S.init(function () {
    if (!restaurantId) {
      restBody.innerHTML = '<p class="form-error">Ресторан не указан. <a href="restaurants.html">Вернуться к списку</a></p>';
      return;
    }
    load();
  });

  function load() {
    return api("GET", "/api/admin/restaurants/" + restaurantId)
      .then(renderRestaurant)
      .catch(function (err) {
        if (err.message === "unauthorized") return;
        restBody.innerHTML = '<p class="form-error">' + esc(err.message) + ' <a href="restaurants.html">Вернуться к списку</a></p>';
      });
  }

  function statusOptions(current) {
    return Object.keys(STATUS).map(function (s) {
      return '<option value="' + s + '"' + (s === current ? " selected" : "") + ">" + STATUS[s] + "</option>";
    }).join("");
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

    // раздел свёрнут по умолчанию; при перерисовке запоминаем, что было открыто
    var hadSection = !!document.getElementById("secData");
    var openData = hadSection ? !!document.querySelector("#secData[open]") : false;

    restBody.innerHTML =
      '<button type="button" class="rest-head" id="restHead" aria-expanded="' + (!collapsed) + '">' +
        '<span class="rest-head-name">' + esc(r.name) + '</span><span class="rest-head-arrow" aria-hidden="true"></span></button>' +
      '<div class="rest-body" id="restBodyInner"' + (collapsed ? " hidden" : "") + '>' +
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
        '<div class="field"><span class="field-label">Цены</span>' +
          '<button type="button" class="btn-outline" id="resetPricesBtn">Сделать цены по умолчанию</button></div>' +
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
      "</form></details></div>";

    document.getElementById("restForm").addEventListener("submit", function (e) {
      e.preventDefault();
      saveRestaurant(r.id, {
        name: document.getElementById("rName").value,
        phone: document.getElementById("rPhone").value,
        address: document.getElementById("rAddress").value,
        status: document.getElementById("rStatus").value,
        newPassword: document.getElementById("rPassword").value || undefined,
      });
    });

    restBody.classList.toggle("is-collapsed", collapsed);
    document.getElementById("restPageTitle").hidden = true;
    document.getElementById("restHead").addEventListener("click", function () {
      collapsed = !collapsed;
      restBody.classList.toggle("is-collapsed", collapsed);
      document.getElementById("restBodyInner").hidden = collapsed;
      this.setAttribute("aria-expanded", String(!collapsed));
    });

    document.getElementById("resetPricesBtn").addEventListener("click", function () {
      var msg = "Вернуть ресторану «" + r.name + "» всё по умолчанию?\n\nВсе индивидуальные цены, скидки и минимальные партии будут сброшены, скрытые товары снова станут видны, и ресторан увидит обычные оптовые цены из раздела «Опт. покупка».";
      if (!window.confirm(msg)) return;
      api("POST", "/api/admin/restaurants/" + r.id + "/reset-prices")
        .then(function () {
          S.showToast("Цены возвращены по умолчанию");
          return load();
        })
        .catch(function (err) { S.showToast(err.message, true); });
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
      if (!window.confirm("Вы точно уверены? Ресторан «" + r.name + "» будет удалён безвозвратно.")) return;
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
  }

  function saveRestaurant(id, changes) {
    var errBox = document.getElementById("rError");
    if (errBox) errBox.hidden = true;
    api("PATCH", "/api/admin/restaurants/" + id, changes)
      .then(function () {
        S.showToast("Сохранено");
        return load();
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
