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
        '<div><button type="button" class="btn-primary rest-portal-btn">Зайти в портал ' + esc(r.name) + "</button></div>";
      var url = "restaurant.html?id=" + r.id;
      row.addEventListener("click", function (e) {
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
        if (e.key === "Enter") window.location.href = url;
      });
      listEl.appendChild(row);
    });
  }


})();
