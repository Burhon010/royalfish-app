const express = require("express");
const db = require("../db");
const { sendOrderNotification } = require("../telegram");
const { createRateLimiter } = require("../middleware/rateLimit");

const router = express.Router();

const MAX_ITEMS_PER_ORDER = 50;
const MAX_QTY_PER_ITEM = 99;

// Honeypot — скрытое от обычных посетителей поле формы (см. index.html/
// styles.css). Реальный человек его не видит и не заполняет; простые
// боты, которые слепо заполняют все поля формы, попадаются на этом.
// Название поля намеренно не "honeypot"/"trap" — не должно подсказывать
// автозаполнителю/боту, что это ловушка.
const HONEYPOT_FIELD = "website";
// Тот же текст, что и для обычной ошибки валидации — не выдаёт, что
// запрос отклонён именно honeypot-проверкой.
const GENERIC_REJECT_MESSAGE = "Не удалось оформить заказ. Проверьте данные и попробуйте снова.";

// Публичный эндпоинт оформления заказа — защита от скрипта, заваливающего
// базу и Telegram-уведомления фейковыми заказами. Обычному покупателю
// оформить 6 заказов за 10 минут более чем достаточно (в т.ч. с учётом
// пары неудачных попыток из-за опечатки в форме).
const ordersRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 6,
  message: "Слишком много заказов с этого адреса за короткое время. Попробуйте через несколько минут.",
});

function serializeOrder(order) {
  return {
    id: order.id,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    customerAddress: order.customer_address,
    comment: order.comment,
    totalAmount: order.total_amount,
    status: order.status,
    createdAt: order.created_at,
    items: (order.items || []).map((it) => ({
      productId: it.product_id,
      productName: it.product_name,
      unitPrice: it.unit_price,
      quantity: it.quantity,
      subtotal: it.subtotal,
    })),
  };
}

function validateOrderBody(body) {
  const errors = [];

  const customerName = String(body.customerName || "").trim();
  const customerPhone = String(body.customerPhone || "").trim();
  const customerAddress = body.customerAddress ? String(body.customerAddress).trim() : "";
  const comment = body.comment ? String(body.comment).trim() : "";

  if (!customerName) errors.push("Укажите имя.");
  if (customerName.length > 120) errors.push("Имя слишком длинное.");
  if (!customerPhone) errors.push("Укажите номер телефона.");
  if (customerPhone.length > 40) errors.push("Номер телефона слишком длинный.");
  if (customerAddress.length > 300) errors.push("Адрес слишком длинный.");
  if (comment.length > 500) errors.push("Комментарий слишком длинный.");

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length) errors.push("Корзина пуста — добавьте хотя бы один товар.");
  if (rawItems.length > MAX_ITEMS_PER_ORDER) errors.push("Слишком много позиций в одном заказе.");

  const items = [];
  for (const raw of rawItems) {
    const productId = Number(raw && raw.productId);
    const quantity = Number(raw && raw.quantity);
    if (!Number.isInteger(productId) || productId <= 0) {
      errors.push("Некорректный товар в корзине.");
      continue;
    }
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QTY_PER_ITEM) {
      errors.push("Некорректное количество для одного из товаров.");
      continue;
    }
    items.push({ productId, quantity });
  }

  return { customerName, customerPhone, customerAddress, comment, items, errors };
}

/* POST /api/orders — оформление заказа из корзины (публичный эндпойнт) */
router.post("/", ordersRateLimit, async (req, res, next) => {
  try {
    // Проверяем ловушку на сервере (не только в браузере) — иначе бот,
    // отправляющий запрос напрямую в API, минуя frontend, обошёл бы её.
    const honeypotValue = String((req.body && req.body[HONEYPOT_FIELD]) || "").trim();
    if (honeypotValue) {
      return res.status(400).json({ error: GENERIC_REJECT_MESSAGE });
    }

    const data = validateOrderBody(req.body || {});
    if (data.errors.length) {
      return res.status(400).json({ error: data.errors.join(" ") });
    }

    const order = await db.createOrder(data);

    // Уведомление в Telegram — заказ уже сохранён в базе к этому моменту.
    // Не ждём (await) отправку и ловим любые ошибки здесь же, чтобы
    // недоступность Telegram никак не влияла на ответ клиенту.
    sendOrderNotification(order).catch(() => {});

    res.status(201).json(serializeOrder(order));
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
