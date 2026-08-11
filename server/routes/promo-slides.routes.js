const express = require("express");
const db = require("../db");

const router = express.Router();

function serialize(s) {
  return {
    id: s.id,
    image: s.image_path,
    title: s.title,
    sortOrder: s.sort_order,
  };
}

/* GET /api/promo-slides — активные слайды для главной страницы, по порядку.
   Если слайдов ещё нет (владелец не настроил) — просто пустой массив,
   сайт должен аккуратно скрыть слайдер, а не сломаться. */
router.get("/", async (req, res, next) => {
  try {
    const rows = await db.getActivePromoSlides();
    res.json(rows.map(serialize));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
