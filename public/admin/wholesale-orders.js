(function () {
  "use strict";

  var S = window.AdminShared;
  var esc = S.esc, money = S.money, api = S.api, blocksWord = S.blocksWord;

  var STATUS = {
    awaiting: "Ожидает подтверждения",
    confirmed: "Подтверждён",
    rejected: "Отклонён",
    processing: "В обработке",
    ready: "Готов к выдаче / доставке",
    completed: "Выполнен",
    cancelled: "Отменён",
  };

  var orders = [];
  var activeFilter = "all";

  var listEl = document.getElementById("woList");
  var overlay = document.getElementById("woModalOverlay");
  var body = document.getElementById("woModalBody");

  S.init(loadOrders);

  function loadOrders() {
    return api("GET", "/api/admin/wholesale-orders")
      .then(function (list) {
        orders = list;
        renderList();
      })
      .catch(function (err) {
        if (err.message === "unauthorized") return;
        listEl.innerHTML = '<p class="list-status">Не удалось загрузить заказы. Обновите страницу.</p>';
      });
  }

  function renderList() {
    var visible = orders.filter(function (o) { return activeFilter === "all" || o.status === activeFilter; });
    listEl.innerHTML = "";
    if (!orders.length) {
      listEl.innerHTML = '<p class="list-status">Оптовых заказов пока нет.</p>';
      return;
    }
    if (!visible.length) {
      listEl.innerHTML = '<p class="list-status">В этом статусе заказов нет.</p>';
      return;
    }
    visible.forEach(function (o) {
      var t = o.totals;
      var row = document.createElement("button");
      row.type = "button";
      row.className = "rest-row";
      row.innerHTML =
        '<div><p class="rest-row-name">' + esc(o.number) + " · " + esc(o.restaurantName) + "</p>" +
        '<p class="rest-row-meta">' + esc(o.restaurantPhone) + " · " + S.fmtDate(o.createdAt) + "</p></div>" +
        '<div><p class="rest-row-meta">' + t.orderedBlocks + " " + blocksWord(t.orderedBlocks) + " · " + t.orderedUnits + " шт.</p>" +
        (t.hasConfirmed ? '<p class="rest-row-meta">Подтв.: ' + t.confirmedBlocks + " " + blocksWord(t.confirmedBlocks) + "</p>" : "") + "</div>" +
        '<div class="rest-row-right">' + money(t.orderedTotal) + " сомони</div>" +
        '<div><span class="adm-badge st-' + o.status + '">' + STATUS[o.status] + "</span></div>";
      row.addEventListener("click", function () { openOrder(o.id); });
      listEl.appendChild(row);
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll("#statusFilterRow .filter-pill"), function (pill) {
    pill.addEventListener("click", function () {
      Array.prototype.forEach.call(document.querySelectorAll("#statusFilterRow .filter-pill"), function (p) {
        p.classList.remove("is-active");
      });
      pill.classList.add("is-active");
      activeFilter = pill.getAttribute("data-filter");
      renderList();
    });
  });

  function statusOptions(cur) {
    return Object.keys(STATUS).map(function (s) {
      return '<option value="' + s + '"' + (s === cur ? " selected" : "") + ">" + STATUS[s] + "</option>";
    }).join("");
  }

  function printLink(o, mode, label, ghost) {
    return '<a class="' + (ghost ? "btn-outline" : "btn-primary") + ' adm-link-btn" target="_blank" rel="noopener" href="../print-order.html?id=' +
      o.id + "&src=admin&mode=" + mode + '">' + label + "</a>";
  }

  function openOrder(id) {
    body.innerHTML = '<p class="list-status">Загружаем…</p>';
    overlay.hidden = false;
    api("GET", "/api/admin/wholesale-orders/" + id).then(renderOrder).catch(function (err) {
      body.innerHTML = '<p class="form-error">' + esc(err.message) + "</p>";
    });
  }

  function renderOrder(o) {
    document.getElementById("woModalTitle").textContent = "Заказ " + o.number;
    var t = o.totals;

    var rows = o.items.map(function (it) {
      return "<tr>" +
        "<td>" + esc(it.productName) + "<br><small>блок = " + it.unitsPerBlock + " шт.</small></td>" +
        '<td class="num">' + it.orderedBlocks + "</td>" +
        '<td class="num">' + it.orderedUnits + "</td>" +
        '<td class="num">' + money(it.pricePerBlock) + "</td>" +
        '<td class="num">' + money(it.orderedSubtotal) + "</td>" +
        '<td><input type="number" min="0" step="1" class="adm-inline-input conf-input" data-id="' + it.id + '" value="' +
          (it.confirmedBlocks === null ? "" : it.confirmedBlocks) + '" placeholder="' + it.orderedBlocks + '"></td>' +
        '<td class="num">' + (it.confirmedUnits === null ? "—" : it.confirmedUnits) + "</td>" +
      "</tr>";
    }).join("");

    body.innerHTML =
      '<p><span class="adm-badge st-' + o.status + '">' + STATUS[o.status] + "</span></p>" +
      '<div class="adm-note"><b>' + esc(o.restaurantName) + "</b><br>Телефон: " + esc(o.restaurantPhone) +
        "<br>Адрес: " + esc(o.restaurantAddress) + "<br>Дата: " + S.fmtDate(o.createdAt) +
        (o.customerComment ? "<br>Комментарий ресторана: " + esc(o.customerComment) : "") + "</div>" +
      '<div class="adm-table-wrap"><table class="adm-table"><thead><tr>' +
        "<th>Товар</th><th>Заказано блоков</th><th>Штук</th><th>Цена/блок</th><th>Сумма</th><th>Подтверждено блоков</th><th>Штук</th>" +
      "</tr></thead><tbody>" + rows + "</tbody><tfoot><tr><td>Всего</td>" +
        '<td class="num">' + t.orderedBlocks + '</td><td class="num">' + t.orderedUnits + "</td><td></td>" +
        '<td class="num">' + money(t.orderedTotal) + '</td><td class="num">' + (t.hasConfirmed ? t.confirmedBlocks : "—") +
        '</td><td class="num">' + (t.hasConfirmed ? t.confirmedUnits : "—") + "</td></tr></tfoot></table></div>" +
      (t.hasConfirmed ? '<div class="adm-note">Подтверждённая сумма: <b>' + money(t.confirmedTotal) + " сомони</b></div>" : "") +
      '<div class="adm-note">Заказанное количество сохраняется в истории и не меняется. Укажите в колонке «Подтверждено» фактическое число блоков (после звонка ресторану).</div>' +
      '<div class="adm-form">' +
        '<label class="field"><span class="field-label">Статус</span><select id="woStatus">' + statusOptions(o.status) + "</select></label>" +
        '<label class="field field--full"><span class="field-label">Комментарий администратора</span>' +
        '<textarea id="woComment" rows="3" maxlength="1000" placeholder="Например: Связались с рестораном. Согласовано 2 блока вместо 4.">' + esc(o.adminComment || "") + "</textarea></label>" +
      "</div>" +
      '<p class="form-error" id="woError" hidden></p>' +
      '<div class="adm-actions">' +
        '<button type="button" class="btn-primary" id="woConfirm">Подтвердить заказ</button>' +
        '<button type="button" class="btn-outline" id="woSave">Сохранить</button>' +
      "</div>" +
      '<div class="adm-actions">' +
        printLink(o, "pdf", "Скачать PDF", true) +
        printLink(o, "print", "Распечатать", true) +
        printLink(o, "warehouse", "Печать для склада", true) +
      "</div>";

    function collect(fillEmptyWithOrdered) {
      var items = [];
      Array.prototype.forEach.call(body.querySelectorAll(".conf-input"), function (inp) {
        var id = Number(inp.getAttribute("data-id"));
        if (inp.value !== "") {
          items.push({ id: id, confirmedBlocks: Number(inp.value) });
        } else if (fillEmptyWithOrdered) {
          var it = o.items.filter(function (x) { return x.id === id; })[0];
          items.push({ id: id, confirmedBlocks: it.orderedBlocks });
        }
      });
      return items;
    }

    function save(payload, okMsg) {
      var errBox = document.getElementById("woError");
      errBox.hidden = true;
      api("PATCH", "/api/admin/wholesale-orders/" + o.id, payload)
        .then(function (updated) {
          S.showToast(okMsg);
          loadOrders();
          renderOrder(updated);
        })
        .catch(function (err) {
          errBox.textContent = err.message;
          errBox.hidden = false;
        });
    }

    document.getElementById("woSave").addEventListener("click", function () {
      save({
        status: document.getElementById("woStatus").value,
        adminComment: document.getElementById("woComment").value,
        items: collect(false),
      }, "Заказ сохранён");
    });

    // "Подтвердить": пустые поля "подтверждено" заполняются заказанным количеством
    document.getElementById("woConfirm").addEventListener("click", function () {
      save({
        status: "confirmed",
        adminComment: document.getElementById("woComment").value,
        items: collect(true),
      }, "Заказ подтверждён");
    });
  }

  document.getElementById("woModalClose").addEventListener("click", function () { overlay.hidden = true; });
  overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.hidden = true; });
})();
