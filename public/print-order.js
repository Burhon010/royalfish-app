(function () {
  "use strict";

  var STATUS = {
    awaiting: "Ожидает подтверждения",
    confirmed: "Подтверждён",
    rejected: "Отклонён",
    processing: "В обработке",
    ready: "Готов к выдаче / доставке",
    completed: "Выполнен",
    cancelled: "Отменён",
  };

  var params = new URLSearchParams(window.location.search);
  var id = Number(params.get("id"));
  var src = params.get("src") === "admin" ? "admin" : "partner";
  var mode = params.get("mode"); // "pdf" | "print" | "warehouse"
  var sheet = document.getElementById("sheet");

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

  var signBlock =
    '<div class="print-sign">' +
      "<div>Принял: ______________________</div>" +
      "<div>Сотрудник: ___________________</div>" +
      "<div>Подпись: _____________________</div>" +
    "</div>";

  function renderOrder(o) {
    var t = o.totals;
    var showConf = t.hasConfirmed;
    var rows = o.items.map(function (it) {
      return "<tr><td>" + esc(it.productName) + "</td>" +
        "<td>" + it.orderedBlocks + "</td>" +
        "<td>" + it.orderedUnits + "</td>" +
        "<td>" + money(it.pricePerBlock) + "</td>" +
        "<td>" + money(it.orderedSubtotal) + "</td>" +
        (showConf ? "<td>" + (it.confirmedBlocks === null ? "—" : it.confirmedBlocks) + "</td>" : "") +
      "</tr>";
    }).join("");

    sheet.innerHTML =
      '<div class="print-head">' +
        '<div class="print-brand">ROYAL FISH<small>royalfish.tj · Душанбе</small></div>' +
        '<div class="print-title">Оптовый заказ<small>№' + esc(o.number) + "</small></div>" +
      "</div>" +
      '<div class="print-meta">' +
        "<div><b>Ресторан:</b> " + esc(o.restaurantName) + "</div>" +
        "<div><b>Телефон:</b> " + esc(o.restaurantPhone) + "</div>" +
        "<div><b>Адрес:</b> " + esc(o.restaurantAddress) + "</div>" +
        "<div><b>Дата:</b> " + fmtDate(o.createdAt) + "</div>" +
      "</div>" +
      '<table class="print-table"><thead><tr>' +
        "<th>Товар</th><th>Блоков</th><th>Штук</th><th>Цена/блок</th><th>Сумма</th>" +
        (showConf ? "<th>Подтв. блоков</th>" : "") +
      "</tr></thead><tbody>" + rows + "</tbody></table>" +
      '<div class="print-totals">' +
        "<div>Всего блоков: <b>" + t.orderedBlocks + "</b></div>" +
        "<div>Всего штук: <b>" + t.orderedUnits + "</b></div>" +
        '<div class="grand">Общая сумма: ' + money(t.orderedTotal) + " сомони</div>" +
        (showConf
          ? "<div>Подтверждено: <b>" + t.confirmedBlocks + " " + blocksWord(t.confirmedBlocks) + " · " +
            t.confirmedUnits + " шт. · " + money(t.confirmedTotal) + " сомони</b></div>"
          : "") +
      "</div>" +
      '<div class="print-status">Статус: ' + esc(STATUS[o.status] || o.status) + "</div>" +
      (o.customerComment ? '<div class="print-comment"><b>Комментарий ресторана:</b> ' + esc(o.customerComment) + "</div>" : "") +
      (o.adminComment ? '<div class="print-comment"><b>Комментарий Royal Fish:</b> ' + esc(o.adminComment) + "</div>" : "") +
      signBlock;
  }

  function renderWarehouse(o) {
    var lis = o.items.map(function (it) {
      var useConf = it.confirmedBlocks !== null;
      var blocks = useConf ? it.confirmedBlocks : it.orderedBlocks;
      var units = blocks * it.unitsPerBlock;
      var note = useConf && it.confirmedBlocks !== it.orderedBlocks
        ? " <small>(заказано " + it.orderedBlocks + " " + blocksWord(it.orderedBlocks) + ")</small>"
        : "";
      return "<li>" + esc(it.productName) + " — " + blocks + " " + blocksWord(blocks) + " — " + units + " шт." + note + "</li>";
    }).join("");
    var t = o.totals;
    var blocksTotal = t.hasConfirmed ? t.confirmedBlocks : t.orderedBlocks;
    var unitsTotal = t.hasConfirmed ? t.confirmedUnits : t.orderedUnits;

    sheet.innerHTML =
      '<div class="print-head">' +
        '<div class="print-brand">ROYAL FISH<small>Сборка заказа</small></div>' +
        '<div class="print-title">СБОРКА ЗАКАЗА<small>№' + esc(o.number) + "</small></div>" +
      "</div>" +
      '<div class="print-meta">' +
        "<div><b>Ресторан:</b> " + esc(o.restaurantName) + "</div>" +
        "<div><b>Заказ №:</b> " + esc(o.number) + "</div>" +
        "<div><b>Дата:</b> " + fmtDate(o.createdAt) + "</div>" +
      "</div>" +
      '<ul class="warehouse-list">' + lis + "</ul>" +
      '<div class="print-totals"><div class="grand">Итого: ' + blocksTotal + " " + blocksWord(blocksTotal) + " — " + unitsTotal + " шт.</div></div>" +
      (o.adminComment ? '<div class="print-comment"><b>Комментарий:</b> ' + esc(o.adminComment) + "</div>" : "") +
      '<div class="print-sign"><div>Собрал: ______________________</div><div>Проверил: ____________________</div></div>';
  }

  function endpoint() {
    return src === "admin" ? "/api/admin/wholesale-orders/" + id : "/api/partners/orders/" + id;
  }

  document.getElementById("printBtn").addEventListener("click", function () { window.print(); });
  document.getElementById("pdfBtn").addEventListener("click", function () { window.print(); });
  document.getElementById("closeBtn").addEventListener("click", function () {
    window.close();
    if (!window.closed) window.history.back();
  });
  if (mode !== "pdf") document.getElementById("pdfHint").hidden = true;

  fetch(endpoint(), { credentials: "same-origin" })
    .then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || "Не удалось загрузить заказ.");
        return data;
      });
    })
    .then(function (order) {
      var warehouse = mode === "warehouse" && src === "admin";
      document.title = (warehouse ? "Сборка " : "Заказ ") + order.number + " — Royal Fish";
      if (warehouse) renderWarehouse(order);
      else renderOrder(order);
      // сразу открываем окно печати (для "Скачать PDF" — "Сохранить как PDF")
      if (mode) setTimeout(function () { window.print(); }, 400);
    })
    .catch(function (err) {
      sheet.innerHTML = '<p class="p-empty">' + esc(err.message) + "</p>";
    });
})();
