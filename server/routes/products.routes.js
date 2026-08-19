const express = require("express");
const db = require("../db");
const { createRateLimiter } = require("../middleware/rateLimit");

const router = express.Router();

// Публичный список товаров грузится один раз при открытии главной
// страницы — обычному посетителю сотни запросов в минуту не нужны.
// Лимит намеренно щедрый: не мешает живым посетителям (в т.ч. за
// общим IP мобильного оператора/офиса), но останавливает явный
// скрейпинг/спам-бота.
const productsRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: "Слишком много запросов. Попробуйте через минуту.",
});

function serialize(p) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    weight: p.weight,
    price: p.price,
    discountPercent: p.discount_percent,
    finalPrice: p.final_price,
    isNew: !!p.is_new,
    inStock: !!p.in_stock,
    image: p.image_path,
  };
}

// GET /api/products — публичный список товаров для розничного каталога
// на сайте. Только available_retail = true; оптовая цена (wholesale_price)
// сюда никогда не попадает — serialize() её просто не включает, поэтому
// розничный покупатель не может случайно увидеть оптовую цену.
router.get("/", productsRateLimit, async (req, res, next) => {
  try {
    const rows = await db.getRetailProducts();
    res.json(rows.map(serialize));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
