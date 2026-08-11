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
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
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
    hour: "2-digit",
    minute: "2-digit",
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

  lines.push(`🐟 <b>Новый заказ №${order.id}</b>`);
  lines.push(formatDate(order.created_at || new Date()));
  lines.push("");
  lines.push(`<b>Клиент:</b> ${escapeHtml(order.customer_name)}`);
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

async function sendOrderNotification(order) {
  if (!BOT_TOKEN || !CHAT_ID) return;

  const text = buildOrderMessage(order);
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[telegram] Не удалось отправить уведомление (HTTP ${res.status}): ${body}`);
    }
  } catch (err) {
    console.error("[telegram] Ошибка отправки уведомления:", err.message);
  }
}

module.exports = { sendOrderNotification };
