const express = require("express");
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();
router.use(requireAuth);

const MAX_CATEGORIES = 30;

/* POST /api/admin/categories — { name } */
router.post("/", async (req, res, next) => {
  try {
    const name = String((req.body && req.body.name) || "").trim();
    if (!name) return res.status(400).json({ error: "Введите название категории." });
    if (name.length > 40) return res.status(400).json({ error: "Название слишком длинное (максимум 40 символов)." });

    const existing = await db.getCategories();
    if (existing.length >= MAX_CATEGORIES) {
      return res.status(400).json({ error: "Слишком много категорий." });
    }
    if (existing.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return res.status(400).json({ error: "Такая категория уже есть." });
    }

    res.status(201).json(await db.createCategory(name));
  } catch (err) {
    next(err);
  }
});

/* DELETE /api/admin/categories/:slug — только пустую категорию */
router.delete("/:slug", async (req, res, next) => {
  try {
    const slug = req.params.slug;
    if (!(await db.categoryExists(slug))) {
      return res.status(404).json({ error: "Категория не найдена." });
    }
    const used = await db.countProductsInCategory(slug);
    if (used > 0) {
      return res.status(400).json({
        error: `В этой категории ${used} товар(ов). Сначала перенесите их в другую категорию или удалите.`,
      });
    }
    await db.deleteCategory(slug);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
