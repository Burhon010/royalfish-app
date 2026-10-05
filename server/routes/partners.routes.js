const express = require("express");
const bcrypt = require("bcryptjs");
const partners = require("../partners");
const { createPartnerToken, TOKEN_TTL_MS } = require("../auth");
const { requirePartner, requireApprovedPartner } = require("../middleware/requirePartner");
const { createRateLimiter } = require("../middleware/rateLimit");
const { sendText, buildWholesaleOrderMessage, buildRegistrationMessage } = require("../telegram");

const router = express.Router();

const registerLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 8,
  message: "Слишком много регистраций с этого адреса. Попробуйте позже.",
});
const loginLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 12,
  message: "Слишком много попыток входа. Попробуйте через несколько минут.",
});
const orderLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: "Слишком много заказов за короткое время. Попробуйте через несколько минут.",
});

// Хеш-пустышка: чтобы вход с несуществующим названием занимал столько же
// времени, сколько вход с существующим (не выдаём, какие рестораны есть).
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 12);

function setSessionCookie(res, restaurantId) {
  res.cookie("rf_partner", createPartnerToken(restaurantId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: TOKEN_TTL_MS,
    path: "/",
  });
}

function publicProfile(r) {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    address: r.address,
    status: r.status,
    priceGroup: r.price_group_name || null,
    createdAt: r.created_at,
  };
}

/* POST /api/partners/register */
router.post("/register", registerLimit, async (req, res, next) => {
  try {
    const b = req.body || {};
    // honeypot — скрытое поле формы; человек его не заполняет
    if (String(b.website || "").trim()) {
      return res.status(400).json({ error: "Не удалось зарегистрироваться. Проверьте данные." });
    }

    const name = String(b.name || "").trim();
    const phone = String(b.phone || "").trim();
    const address = String(b.address || "").trim();
    const password = String(b.password || "");
    const passwordConfirm = String(b.passwordConfirm || "");

    const errors = [];
    if (name.length < 2) errors.push("Укажите название ресторана / кафе.");
    if (name.length > 100) errors.push("Название слишком длинное.");
    if (!phone) errors.push("Укажите телефон.");
    if (phone.length > 40) errors.push("Телефон слишком длинный.");
    if (!address) errors.push("Укажите адрес.");
    if (address.length > 300) errors.push("Адрес слишком длинный.");
    if (password.length < 8) errors.push("Пароль должен быть не короче 8 символов.");
    if (password.length > 100) errors.push("Пароль слишком длинный.");
    if (password !== passwordConfirm) errors.push("Пароли не совпадают.");
    if (errors.length) return res.status(400).json({ error: errors.join(" ") });

    const restaurant = await partners.registerRestaurant({ name, phone, address, password });
    await sendText(buildRegistrationMessage(restaurant)).catch(() => {});

    // Сразу входим в аккаунт — он покажет статус "ожидает одобрения".
    setSessionCookie(res, restaurant.id);
    res.status(201).json({ ok: true, status: restaurant.status });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

/* POST /api/partners/login — по названию ресторана и паролю */
router.post("/login", loginLimit, async (req, res, next) => {
  try {
    const name = String((req.body && req.body.name) || "").trim();
    const password = String((req.body && req.body.password) || "");
    if (!name || !password) {
      return res.status(400).json({ error: "Введите название ресторана и пароль." });
    }

    const restaurant = await partners.getRestaurantByName(name);
    const ok = bcrypt.compareSync(password, restaurant ? restaurant.password_hash : DUMMY_HASH);
    if (!restaurant || !ok) {
      return res.status(401).json({ error: "Неверное название ресторана или пароль." });
    }

    setSessionCookie(res, restaurant.id);
    res.json({ ok: true, status: restaurant.status });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("rf_partner", { path: "/" });
  res.json({ ok: true });
});

/* GET /api/partners/me — доступен в любом статусе (покажет "ожидает одобрения") */
router.get("/me", requirePartner, (req, res) => {
  res.json({ ...publicProfile(req.restaurant), impersonated: !!req.impersonated });
});

/* GET /api/partners/catalog — каталог с ИТОГОВЫМИ ценами этого ресторана */
router.get("/catalog", requireApprovedPartner, async (req, res, next) => {
  try {
    res.json(await partners.getCatalogForRestaurant(req.restaurant));
  } catch (err) {
    next(err);
  }
});

/* POST /api/partners/orders — { items: [{ productId, blocks }], comment } */
router.post("/orders", requireApprovedPartner, orderLimit, async (req, res, next) => {
  try {
    const body = req.body || {};
    const comment = String(body.comment || "").trim();
    if (comment.length > 500) return res.status(400).json({ error: "Комментарий слишком длинный." });

    const raw = Array.isArray(body.items) ? body.items : [];
    if (!raw.length) return res.status(400).json({ error: "Корзина пуста — добавьте хотя бы один товар." });
    if (raw.length > partners.MAX_ITEMS_PER_ORDER) {
      return res.status(400).json({ error: "Слишком много позиций в одном заказе." });
    }

    const merged = new Map();
    for (const it of raw) {
      const productId = Number(it && it.productId);
      const blocks = Number(it && it.blocks);
      if (!Number.isInteger(productId) || productId <= 0 ||
          !Number.isInteger(blocks) || blocks <= 0 || blocks > partners.MAX_BLOCKS_PER_ITEM) {
        return res.status(400).json({ error: "Некорректный товар или количество блоков." });
      }
      merged.set(productId, Math.min((merged.get(productId) || 0) + blocks, partners.MAX_BLOCKS_PER_ITEM));
    }
    const items = Array.from(merged, ([productId, blocks]) => ({ productId, blocks }));

    const order = await partners.createWholesaleOrder(req.restaurant, items, comment);
    await sendText(buildWholesaleOrderMessage(order)).catch(() => {});
    res.status(201).json(order);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

/* GET /api/partners/orders — только заказы ЭТОГО ресторана */
router.get("/orders", requireApprovedPartner, async (req, res, next) => {
  try {
    res.json(await partners.listWholesaleOrders({ restaurantId: req.restaurant.id }));
  } catch (err) {
    next(err);
  }
});

/* GET /api/partners/orders/:id — чужой заказ = 404, как будто его нет */
router.get("/orders/:id", requireApprovedPartner, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ error: "Заказ не найден." });
    const order = await partners.getWholesaleOrder(id, req.restaurant.id);
    if (!order) return res.status(404).json({ error: "Заказ не найден." });
    res.json(order);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
