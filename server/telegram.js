/* ============================================================
   Telegram-уведомления о новых заказах.

   Если TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы — модуль
   просто ничего не делает (заказ всё равно сохраняется в базе).
   Любая ошибка отправки (нет сети, неверный токен, Telegram
   временно недоступен и т.п.) только логируется в консоль сервера
   и никогда не "выбрасывается" наружу — оформление заказа не
   должно зависеть от Telegram.
   ============================================================ */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
// Несколько получателей — через запятую: TELEGRAM_CHAT_ID=111111,222222,-100333444
const CHAT_IDS = String(process.env.TELEGRAM_CHAT_ID || "")
  .split(/[,\s;]+/)
  .filter(Boolean);

if (!BOT_TOKEN || !CHAT_IDS.length) {
  console.warn(
    "[telegram] TELEGRAM_BOT_TOKEN и/или TELEGRAM_CHAT_ID не заданы — " +
    "уведомления о новых заказах отправляться не будут (сами заказы при этом сохраняются как обычно)."
  );
}

function formatPrice(n) {
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(".", ",");
}

function formatDate(date) {
  return new Date(date).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Telegram parse_mode "HTML" понимает только несколько тегов —
// экранируем спецсимволы, чтобы название товара/комментарий клиента
// случайно не сломали разметку сообщения.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildOrderMessage(order) {
  const lines = [];
  const isWholesale = order.order_type === "wholesale";

  if (isWholesale) {
    lines.push(`🧾 <b>Новый ОПТОВЫЙ заказ для ресторана №${order.number || order.id}</b>`);
  } else {
    lines.push(`🐟 <b>Новый заказ №${order.number || order.id}</b>`);
  }
  lines.push(formatDate(order.created_at || new Date()));
  lines.push("");
  if (isWholesale) {
    lines.push(`<b>Ресторан/компания:</b> ${escapeHtml(order.company_name || "—")}`);
    lines.push(`<b>Контактное лицо:</b> ${escapeHtml(order.customer_name)}`);
  } else {
    lines.push(`<b>Клиент:</b> ${escapeHtml(order.customer_name)}`);
  }
  lines.push(`<b>Телефон:</b> ${escapeHtml(order.customer_phone)}`);
  lines.push(`<b>Адрес:</b> ${order.customer_address ? escapeHtml(order.customer_address) : "самовывоз (не указан)"}`);
  if (order.comment) {
    lines.push(`<b>Комментарий:</b> ${escapeHtml(order.comment)}`);
  }

  lines.push("");
  lines.push("<b>Товары:</b>");
  (order.items || []).forEach((it) => {
    lines.push(
      `• ${escapeHtml(it.product_name)} — ${it.quantity} × ${formatPrice(it.unit_price)} = ${formatPrice(it.subtotal)} смн`
    );
  });

  lines.push("");
  lines.push(`<b>Итого: ${formatPrice(order.total_amount)} сомони</b>`);

  return lines.join("\n");
}

async function sendText(text) {
  if (!BOT_TOKEN || !CHAT_IDS.length) return;

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  // Каждому получателю — отдельный запрос; ошибка у одного (например,
  // человек ещё не нажал /start у бота) не мешает остальным.
  await Promise.all(
    CHAT_IDS.map(async (chatId) => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.error(`[telegram] Не удалось отправить уведомление в ${chatId} (HTTP ${res.status}): ${body}`);
        }
      } catch (err) {
        console.error(`[telegram] Ошибка отправки уведомления в ${chatId}:`, err.message);
      }
    })
  );
}

async function sendOrderNotification(order) {
  await sendText(buildOrderMessage(order));
}

function buildWholesaleOrderMessage(order) {
  const lines = [];
  lines.push(`🧾 <b>Новый оптовый заказ ${escapeHtml(order.number)}</b>`);
  lines.push(formatDate(order.createdAt || new Date()));
  lines.push("");
  lines.push(`<b>Ресторан:</b> ${escapeHtml(order.restaurantName)}`);
  lines.push(`<b>Телефон:</b> ${escapeHtml(order.restaurantPhone)}`);
  lines.push(`<b>Адрес:</b> ${escapeHtml(order.restaurantAddress)}`);
  if (order.customerComment) lines.push(`<b>Комментарий:</b> ${escapeHtml(order.customerComment)}`);
  lines.push("");
  lines.push("<b>Товары:</b>");
  (order.items || []).forEach((it) => {
    lines.push(
      `• ${escapeHtml(it.productName)} — ${it.orderedBlocks} бл. (${it.orderedUnits} шт.) × ${formatPrice(it.pricePerBlock)} = ${formatPrice(it.orderedSubtotal)} смн`
    );
  });
  lines.push("");
  lines.push(`<b>Всего: ${order.totals.orderedBlocks} бл. / ${order.totals.orderedUnits} шт. / ${formatPrice(order.totals.orderedTotal)} сомони</b>`);
  lines.push("Статус: ожидает подтверждения");
  return lines.join("\n");
}

function buildRegistrationMessage(r) {
  return [
    "🏪 <b>Новая заявка ресторана на партнёрство</b>",
    "",
    `<b>Название:</b> ${escapeHtml(r.name)}`,
    `<b>Телефон:</b> ${escapeHtml(r.phone)}`,
    `<b>Адрес:</b> ${escapeHtml(r.address)}`,
    "",
    "Одобрить можно в админке → Рестораны.",
  ].join("\n");
}

module.exports = { sendOrderNotification, sendText, buildWholesaleOrderMessage, buildRegistrationMessage };
