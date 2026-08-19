const express = require("express");
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { uploadImageBuffer, deleteCloudinaryImage, upload, MAX_IMAGE_BYTES } = require("../cloudinary");

const router = express.Router();
router.use(requireAuth);

const CATEGORIES = ["fish", "shrimp", "squid", "caviar", "delicacy", "lobster", "other"];

function computeFinalPrice(price, discountPercent) {
  return Math.round(price * (1 - discountPercent / 100) * 100) / 100;
}

function toBool(v) {
  return v === "true" || v === true || v === "1";
}

function readBody(body) {
  const name = String(body.name || "").trim();
  const category = String(body.category || "").trim();
  const weight = String(body.weight || "").trim();
  const description = body.description !== undefined ? String(body.description).trim() : "";
  const price = Number(body.price);
  const discountPercent = body.discountPercent !== undefined ? Number(body.discountPercent) : 0;
  const isNew = toBool(body.isNew);
  const inStock = toBool(body.inStock);
  const availableRetail = body.availableRetail !== undefined ? toBool(body.availableRetail) : true;
  const availableWholesale = toBool(body.availableWholesale);

  // Оптовая цена необязательна (товар может продаваться только в розницу) —
  // но если её прислали пустой строкой/не прислали вовсе, храним как null,
  // а не 0 (0 сомони — это не "цены нет", а конкретная, скорее всего
  // ошибочная цена).
  const hasWholesalePrice = body.wholesalePrice !== undefined && String(body.wholesalePrice).trim() !== "";
  const wholesalePrice = hasWholesalePrice ? Number(body.wholesalePrice) : null;
  const wholesaleMinQty = body.wholesaleMinQty !== undefined && String(body.wholesaleMinQty).trim() !== ""
    ? Number(body.wholesaleMinQty)
    : 1;

  const errors = [];
  if (!name) errors.push("Укажите название товара.");
  if (name.length > 120) errors.push("Название слишком длинное (максимум 120 символов).");
  if (!CATEGORIES.includes(category)) errors.push("Выберите категорию из списка.");
  if (!weight) errors.push("Укажите вес (например, 500 г или 1 кг).");
  if (weight.length > 40) errors.push("Слишком длинное значение веса.");
  if (description.length > 1000) errors.push("Описание слишком длинное (максимум 1000 символов).");
  if (!Number.isFinite(price) || price < 0) errors.push("Укажите корректную розничную цену.");
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 90) {
    errors.push("Скидка должна быть от 0 до 90%.");
  }
  if (hasWholesalePrice && (!Number.isFinite(wholesalePrice) || wholesalePrice < 0)) {
    errors.push("Укажите корректную оптовую цену.");
  }
  if (!Number.isInteger(wholesaleMinQty) || wholesaleMinQty < 1) {
    errors.push("Минимальная оптовая партия должна быть целым числом не меньше 1.");
  }
  if (availableWholesale && !hasWholesalePrice) {
    errors.push("Чтобы включить товар в опт, сначала укажите оптовую цену.");
  }
  if (!availableRetail && !availableWholesale) {
    errors.push("Товар должен быть доступен хотя бы в одном канале — рознице или опте.");
  }

  return {
    name,
    category,
    weight,
    description,
    price,
    discountPercent,
    isNew,
    inStock,
    wholesalePrice,
    wholesaleMinQty,
    availableRetail,
    availableWholesale,
    errors,
  };
}

function serialize(p) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    weight: p.weight,
    description: p.description,
    price: p.price,
    discountPercent: p.discount_percent,
    finalPrice: p.final_price,
    isNew: !!p.is_new,
    inStock: !!p.in_stock,
    image: p.image_path,
    wholesalePrice: p.wholesale_price,
    wholesaleMinQty: p.wholesale_min_qty,
    availableRetail: !!p.available_retail,
    availableWholesale: !!p.available_wholesale,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

/* GET /api/admin/products — полный список для панели управления */
router.get("/", async (req, res, next) => {
  try {
    const rows = await db.getAllProducts();
    res.json(rows.map(serialize));
  } catch (err) {
    next(err);
  }
});

/* POST /api/admin/products — создать товар (multipart/form-data, поле "image" опционально) */
router.post("/", upload.single("image"), async (req, res, next) => {
  try {
    const data = readBody(req.body);
    if (data.errors.length) {
      return res.status(400).json({ error: data.errors.join(" ") });
    }

    let imagePath = null;
    let imagePublicId = null;
    if (req.file) {
      try {
        const result = await uploadImageBuffer(req.file.buffer, "royalfish/products");
        imagePath = result.secure_url;
        imagePublicId = result.public_id;
      } catch (err) {
        console.error("[cloudinary] ошибка загрузки:", err.message);
        return res.status(502).json({
          error: "Не удалось загрузить фото в облачное хранилище. Проверьте настройки Cloudinary и попробуйте снова.",
        });
      }
    }

    const finalPrice = computeFinalPrice(data.price, data.discountPercent);

    const created = await db.createProduct({
      name: data.name,
      category: data.category,
      weight: data.weight,
      description: data.description || null,
      price: data.price,
      discount_percent: data.discountPercent,
      final_price: finalPrice,
      is_new: data.isNew ? 1 : 0,
      in_stock: data.inStock ? 1 : 0,
      image_path: imagePath,
      image_public_id: imagePublicId,
      wholesale_price: data.wholesalePrice,
      wholesale_min_qty: data.wholesaleMinQty,
      available_retail: data.availableRetail,
      available_wholesale: data.availableWholesale,
    });

    res.status(201).json(serialize(created));
  } catch (err) {
    next(err);
  }
});

/* PUT /api/admin/products/:id — обновить товар (можно заменить фото, отправив новый файл) */
router.put("/:id", upload.single("image"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.getProductById(id);
    if (!existing) return res.status(404).json({ error: "Товар не найден." });

    const data = readBody(req.body);
    if (data.errors.length) {
      return res.status(400).json({ error: data.errors.join(" ") });
    }

    let imagePath = existing.image_path;
    let imagePublicId = existing.image_public_id;

    if (req.file) {
      // сначала загружаем новое фото, и только при успехе — удаляем старое
      let result;
      try {
        result = await uploadImageBuffer(req.file.buffer, "royalfish/products");
      } catch (err) {
        console.error("[cloudinary] ошибка загрузки:", err.message);
        return res.status(502).json({
          error: "Не удалось загрузить фото в облачное хранилище. Товар не изменён, попробуйте снова.",
        });
      }
      deleteCloudinaryImage(existing.image_public_id);
      imagePath = result.secure_url;
      imagePublicId = result.public_id;
    } else if (req.body.removeImage === "true") {
      // явное удаление фото без замены — только по действию администратора
      deleteCloudinaryImage(existing.image_public_id);
      imagePath = null;
      imagePublicId = null;
    }

    const finalPrice = computeFinalPrice(data.price, data.discountPercent);

    const updated = await db.updateProduct(id, {
      name: data.name,
      category: data.category,
      weight: data.weight,
      description: data.description || null,
      price: data.price,
      discount_percent: data.discountPercent,
      final_price: finalPrice,
      is_new: data.isNew ? 1 : 0,
      in_stock: data.inStock ? 1 : 0,
      image_path: imagePath,
      image_public_id: imagePublicId,
      wholesale_price: data.wholesalePrice,
      wholesale_min_qty: data.wholesaleMinQty,
      available_retail: data.availableRetail,
      available_wholesale: data.availableWholesale,
    });

    res.json(serialize(updated));
  } catch (err) {
    next(err);
  }
});

/* DELETE /api/admin/products/:id/image — удалить только фото, оставив товар */
router.delete("/:id/image", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.getProductById(id);
    if (!existing) return res.status(404).json({ error: "Товар не найден." });

    deleteCloudinaryImage(existing.image_public_id);
    const updated = await db.updateProduct(id, { image_path: null, image_public_id: null });

    res.json(serialize(updated));
  } catch (err) {
    next(err);
  }
});

/* DELETE /api/admin/products/:id — удалить товар целиком */
router.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.getProductById(id);
    if (!existing) return res.status(404).json({ error: "Товар не найден." });

    deleteCloudinaryImage(existing.image_public_id);
    await db.deleteProduct(id);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* Обработчик ошибок multer/загрузки файлов (например, файл слишком большой) */
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
