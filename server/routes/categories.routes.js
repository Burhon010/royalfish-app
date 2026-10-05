const express = require("express");
const db = require("../db");

const router = express.Router();

/* GET /api/categories — публичный список категорий для фильтров каталога */
router.get("/", async (req, res, next) => {
  try {
    res.json(await db.getCategories());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
