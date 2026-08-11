const express = require("express");
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { uploadImageBuffer, deleteCloudinaryImage, upload, MAX_IMAGE_BYTES } = require("../cloudinary");

const router = express.Router();
router.use(requireAuth);

// Разумный потолок на количество слайдов — защита от случайного
// заваливания главной страницы десятками картинок, а не жёсткое
// архитектурное ограничение (в БД лимита в 3 слайда нет).
const MAX_SLIDES = 10;

function serialize(s) {
  return {
    id: s.id,
    image: s.image_path,
    title: s.title,
    isActive: !!s.is_active,
    sortOrder: s.sort_order,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

/* GET /api/admin/promo-slides — все слайды (в т.ч. выключенные) для управления */
router.get("/", async (req, res, next) => {
  try {
    const rows = await db.getAllPromoSlides();
    res.json(rows.map(serialize));
  } catch (err) {
    next(err);
  }
});

/* POST /api/admin/promo-slides — добавить новый слайд (фото обязательно) */
router.post("/", upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Выберите изображение для слайда." });
    }

    const existing = await db.getAllPromoSlides();
    if (existing.length >= MAX_SLIDES) {
      return res.status(400).json({ error: `Достигнут лимит в ${MAX_SLIDES} слайдов. Удалите один из существующих, чтобы добавить новый.` });
    }

    const title = String(req.body.title || "").trim().slice(0, 200);

    let result;
    try {
      result = await uploadImageBuffer(req.file.buffer, "royalfish/promo");
    } catch (err) {
      console.error("[cloudinary] ошибка загрузки слайда:", err.message);
      return res.status(502).json({
        error: "Не удалось загрузить изображение в облачное хранилище. Проверьте настройки Cloudinary и попробуйте снова.",
      });
    }

    const created = await db.createPromoSlide({
      image_path: result.secure_url,
      image_public_id: result.public_id,
      title: title || null,
    });

    res.status(201).json(serialize(created));
  } catch (err) {
    next(err);
  }
});

/* PUT /api/admin/promo-slides/:id — заменить фото и/или заголовок, включить/выключить */
router.put("/:id", upload.single("image"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.getPromoSlideById(id);
    if (!existing) return res.status(404).json({ error: "Слайд не найден." });

    const update = {};

    if (req.body.title !== undefined) {
      update.title = String(req.body.title).trim().slice(0, 200) || null;
    }
    if (req.body.isActive !== undefined) {
      update.is_active = req.body.isActive === "true" || req.body.isActive === true || req.body.isActive === "1";
    }

    if (req.file) {
      let result;
      try {
        result = await uploadImageBuffer(req.file.buffer, "royalfish/promo");
      } catch (err) {
        console.error("[cloudinary] ошибка загрузки слайда:", err.message);
        return res.status(502).json({
          error: "Не удалось загрузить новое изображение. Слайд не изменён, попробуйте снова.",
        });
      }
      // сначала загрузили новое — только теперь удаляем старое
      deleteCloudinaryImage(existing.image_public_id);
      update.image_path = result.secure_url;
      update.image_public_id = result.public_id;
    }

    const updated = await db.updatePromoSlide(id, update);
    res.json(serialize(updated));
  } catch (err) {
    next(err);
  }
});

/* PATCH /api/admin/promo-slides/:id/move — сдвинуть слайд вверх/вниз в списке */
router.patch("/:id/move", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const direction = req.body.direction;
    if (direction !== "up" && direction !== "down") {
      return res.status(400).json({ error: "direction должен быть 'up' или 'down'." });
    }

    const existing = await db.getPromoSlideById(id);
    if (!existing) return res.status(404).json({ error: "Слайд не найден." });

    await db.movePromoSlide(id, direction);
    const rows = await db.getAllPromoSlides();
    res.json(rows.map(serialize));
  } catch (err) {
    next(err);
  }
});

/* DELETE /api/admin/promo-slides/:id — удалить слайд целиком (и фото из Cloudinary) */
router.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.getPromoSlideById(id);
    if (!existing) return res.status(404).json({ error: "Слайд не найден." });

    deleteCloudinaryImage(existing.image_public_id);
    await db.deletePromoSlide(id);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* Обработчик ошибок multer/загрузки файлов */
router.use((err, req, res, next) => {
  if (err) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: `Файл слишком большой (максимум ${MAX_IMAGE_BYTES / (1024 * 1024)} МБ). Сожмите фото и попробуйте снова.` });
    }
    return res.status(400).json({ error: err.message || "Ошибка загрузки файла." });
  }
  next();
});

module.exports = router;
