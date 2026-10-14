/* Красный знак на пункте «Рестораны» в шапке: сколько ресторанов ждут одобрения (только что зарегистрировались) */
(function () {
  "use strict";

  var link = document.querySelector('.admin-header-actions a[href="restaurants.html"]');
  if (!link) return;

  var badge = document.createElement("span");
  badge.className = "nav-badge";
  badge.hidden = true;
  link.appendChild(document.createTextNode(" "));
  link.appendChild(badge);

  function refresh() {
    fetch("/api/admin/restaurants", { credentials: "same-origin" })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (list) {
        if (!Array.isArray(list)) return;
        var n = list.filter(function (r) { return r.status === "pending"; }).length;
        badge.textContent = n;
        badge.hidden = n === 0;
        link.title = n ? "Новых заявок от ресторанов: " + n : "";
      })
      .catch(function () {});
  }

  refresh();
  setInterval(refresh, 60000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) refresh();
  });
})();
