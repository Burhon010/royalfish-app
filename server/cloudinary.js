const { Readable } = require("stream");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;

/* ============================================================
   Общий модуль для загрузки изображений в Cloudinary.
   Используется и товарами (server/routes/admin-products.routes.js),
   и рекламными слайдами (server/routes/admin-promo-slides.routes.js) —
   логика загрузки/удаления в одном месте, чтобы не дублировать её
   и не рисковать рассинхронизацией при будущих правках.

   Настройка (см. README, раздел про переменные окружения):
     1. Зарегистрируйтесь бесплатно на cloudinary.com
     2. В Dashboard скопируйте Cloud name, API Key, API Secret
     3. Впишите их в .env / хостинг → Environment:
          CLOUDINARY_CLOUD_NAME=...
          CLOUDINARY_API_KEY=...
          CLOUDINARY_API_SECRET=...
   ============================================================ */

if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.warn(
    "[внимание] Переменные CLOUDINARY_* не заданы — загрузка изображений (товары, слайды) работать не будет. " +
    "Добавьте CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET в .env / Environment на хостинге."
  );
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Загружает буфер файла в Cloudinary в указанную папку (например,
// "royalfish/products" или "royalfish/promo") — так проще ориентироваться
// в Cloudinary Dashboard и точечно чистить только нужную категорию фото.
function uploadImageBuffer(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: folder || "royalfish/misc" },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    Readable.from(buffer).pipe(stream);
  });
}

// Удаление — fire-and-forget с логированием ошибки, чтобы неудачное
// удаление старого файла никогда не ломало основной запрос.
function deleteCloudinaryImage(publicId) {
  if (!publicId) return;
  cloudinary.uploader.destroy(publicId).catch((err) => {
    console.error("[cloudinary] не удалось удалить файл:", err.message);
  });
}

const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": true,
  "image/png": true,
  "image/webp": true,
};

// файл держим в памяти (не на диске) и сразу отдаём в Cloudinary.
// Лимит намеренно ниже "круглых" 5 МБ: на Vercel у serverless-функций
// есть жёсткий потолок в 4.5 МБ на весь запрос целиком (включая
// служебные поля формы) — это ограничение инфраструктуры хостинга,
// в коде его не обойти. На Render такого ограничения нет, но лимит
// в 4 МБ разумен для любого хостинга.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 МБ

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES[file.mimetype]) {
      return cb(new Error("Разрешены только изображения формата JPG, PNG или WEBP."));
    }
    cb(null, true);
  },
});

module.exports = {
  cloudinary,
  uploadImageBuffer,
  deleteCloudinaryImage,
  upload,
  MAX_IMAGE_BYTES,
};
