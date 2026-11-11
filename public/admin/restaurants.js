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

  var listEl = document.getElementById("restList");
  var listStatus = document.getElementById("listStatus");

  S.init(function () {
    loadRestaurants();
  });

  /* ---------------- список ---------------- */
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
      var wrap = document.createElement("div");
      wrap.className = "rest-item";
      var row = document.createElement("div");
      row.className = "rest-row";
      row.setAttribute("tabindex", "0");
      row.setAttribute("role", "button");
      row.innerHTML =
        '<div class="rest-row-num">' + (index + 1) + "</div>" +
        '<div class="rest-row-main"><p class="rest-row-name">' + esc(r.name) + "</p>" +
        '<p class="rest-row-meta">' + esc(r.phone) + " · " + esc(r.address) + "</p></div>" +
        '<div><p class="rest-row-meta">Регистрация: ' + S.fmtDate(r.createdAt) + "</p></div>" +
        '<div><span class="adm-badge st-' + r.status + '">' + STATUS[r.status] + "</span></div>" +
        '<div><button type="button" class="btn-primary rest-portal-btn">Зайти в портал ' + esc(r.name) + "</button></div>" +
        '<div><button type="button" class="rest-toggle" aria-expanded="false" aria-label="Показать данные ресторана"><span class="rest-head-arrow" aria-hidden="true"></span></button></div>';
      var details = document.createElement("div");
      details.className = "rest-details";
      details.hidden = true;
      var loaded = false;
      var toggle = row.querySelector(".rest-toggle");

      function toggleDetails() {
        var open = details.hidden;
        details.hidden = !open;
        toggle.setAttribute("aria-expanded", String(open));
        wrap.classList.toggle("is-open", open);
        if (open && !loaded) {
          loaded = true;
          details.innerHTML = '<p class="rest-row-meta">Загружаем…</p>';
          api("GET", "/api/admin/restaurants/" + r.id)
            .then(function (full) { renderDetails(details, full); })
            .catch(function (err) {
              loaded = false;
              details.innerHTML = '<p class="rest-row-meta">Не удалось загрузить данные: ' + esc(err.message) + "</p>";
            });
        }
      }

      var url = "restaurant.html?id=" + r.id;
      row.addEventListener("click", function (e) {
        if (e.target.closest(".rest-toggle")) {
          toggleDetails();
          return;
        }
        if (!e.target.closest(".rest-portal-btn")) {
          window.location.href = url;
          return;
        }
        // окно открываем сразу по клику, чтобы браузер не заблокировал его
        var w = window.open("", "_blank");
        api("POST", "/api/admin/restaurants/" + r.id + "/enter")
          .then(function () {
            var target = "../portal.html?admin=" + r.id;
            if (w) w.location.href = target;
            else window.location.href = target;
          })
          .catch(function (err) {
            if (w) w.close();
            S.showToast(err.message, true);
          });
      });
      row.addEventListener("keydown", function (e) {
        if (e.target.closest(".rest-toggle")) return;
        if (e.key === "Enter") window.location.href = url;
      });
      wrap.appendChild(row);
      wrap.appendChild(details);
      listEl.appendChild(wrap);
    });
  }

  function renderDetails(el, r) {
    function line(label, value) {
      return '<div class="rest-d-item"><span class="rest-d-label">' + label + '</span><span class="rest-d-value">' + value + "</span></div>";
    }
    var priced = (r.prices || []).length;
    var hidden = (r.prices || []).filter(function (p) { return p.hidden; }).length;
    el.innerHTML =
      '<div class="rest-d-grid">' +
        line("Название", esc(r.name)) +
        line("Телефон", '<a href="tel:' + esc(String(r.phone).replace(/[^\d+]/g, "")) + '">' + esc(r.phone) + "</a>") +
        line("Адрес", esc(r.address)) +
        line("Статус", '<span class="adm-badge st-' + r.status + '">' + STATUS[r.status] + "</span>") +
        line("Регистрация", S.fmtDate(r.createdAt)) +
        line("Оптовых заказов", String(r.ordersCount || 0)) +
        line("Ценовая группа", r.priceGroupName ? esc(r.priceGroupName) : "Базовые цены") +
        line("Товаров с оптовой ценой", priced + (hidden ? " (скрыто: " + hidden + ")" : "")) +
        line("Пароль", r.password
          ? '<span class="pw-reveal"><code class="rest-d-pw">••••••••</code> <button type="button" class="adm-small-btn rest-d-pwbtn">Показать</button></span>'
          : "<small>не сохранён — задайте на странице ресторана</small>") +
      "</div>" +
      '<a class="btn-outline adm-link-btn rest-d-more" href="restaurant.html?id=' + r.id + '">Изменить данные и цены</a>';
    var btn = el.querySelector(".rest-d-pwbtn");
    if (btn) {
      btn.addEventListener("click", function () {
        var code = el.querySelector(".rest-d-pw");
        var shown = btn.textContent === "Скрыть";
        code.textContent = shown ? "••••••••" : r.password;
        btn.textContent = shown ? "Показать" : "Скрыть";
      });
    }
  }


})();
