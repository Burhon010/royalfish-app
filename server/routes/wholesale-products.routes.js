const express = require("express");
const db = require("../db");
const { createRateLimiter } = require("../middleware/rateLimit");

const router = express.Router();

// Тот же лимит, что и у розничного каталога (server/routes/products.routes.js) —
// щедрый для живых посетителей, но останавливает скрейпинг/спам.
const wholesaleRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: "Слишком много запросов. Попробуйте через минуту.",
});

// Публичный оптовый каталог "Для ресторанов". Отдаёт только оптовую цену
// и оптовые поля — розничная цена (price/finalPrice) сюда сознательно не
// попадает, чтобы обычный посетитель, зашедший в этот раздел напрямую по
// ссылке, не видел розничные скидки/цены вперемешку с оптовыми.
function serialize(p) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    weight: p.weight,
    description: p.description,
    wholesalePrice: p.wholesale_price,
    wholesaleMinQty: p.wholesale_min_qty,
    inStock: !!p.in_stock,
    image: p.image_path,
  };
}

// GET /api/wholesale/products — публичный список товаров для раздела
// "Для ресторанов | Опт". Доступ не защищён логином (см. решение в
// архитектуре: оптовый каталог публичный, как и розничный) — только
// товары с available_wholesale = true и заполненной оптовой ценой.
router.get("/", wholesaleRateLimit, async (req, res, next) => {
  try {
    const rows = await db.getWholesaleProducts();
    res.json(rows.map(serialize));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
