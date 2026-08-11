const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");

const authRoutes = require("./routes/auth.routes");
const productsRoutes = require("./routes/products.routes");
const adminProductsRoutes = require("./routes/admin-products.routes");
const ordersRoutes = require("./routes/orders.routes");
const adminOrdersRoutes = require("./routes/admin-orders.routes");
const promoSlidesRoutes = require("./routes/promo-slides.routes");
const adminPromoSlidesRoutes = require("./routes/admin-promo-slides.routes");

/* ============================================================
   Сборка Express-приложения без запуска сервера.
   Вынесено в отдельный файл, чтобы один и тот же app можно было:
     - запустить как обычный сервер (app.listen) — server/index.js,
       используется на Render / локально;
     - обернуть в serverless-функцию — api/index.js, используется
       на Vercel (там app.listen не нужен и не должен вызываться,
       Vercel сам управляет приёмом запросов).
   ============================================================ */
function createApp() {
  const app = express();

  app.set("trust proxy", 1); // важно за прокси — и на Render, и на Vercel

  app.use(
    helmet({
      // Точечная CSP под реально используемые ресурсы проекта (проверено
      // по всему фронтенду: public/ и public/admin/) — без unsafe-inline
      // и unsafe-eval, они не нужны:
      //   - инлайн-стилей/атрибутов style="" и инлайн-обработчиков
      //     (onclick и т.п.) в разметке нет вообще, весь CSS — внешние
      //     файлы (styles.css/admin.css) + Google Fonts;
      //   - весь JS — только свои файлы (script.js, admin.js и т.д.),
      //     ни одного инлайн-<script> с кодом и ни одного eval/Function;
      //     <script type="application/ld+json"> в index.html — не код,
      //     браузеры не применяют к нему script-src;
      //   - все fetch() идут на собственные /api/... (same-origin).
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          // fonts.googleapis.com отдаёт сам CSS-файл шрифтов (подключён как
          // <link rel="stylesheet">) — это ресурс style-src, а не font-src.
          styleSrc: ["'self'", "https://fonts.googleapis.com"],
          // а вот сами файлы шрифтов (.woff2 и т.п.), на которые ссылается
          // тот CSS, отдаёт другой домен Google — fonts.gstatic.com.
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: [
            "'self'",
            "data:", // превью ещё не загруженного фото в форме админки (FileReader)
            "https://res.cloudinary.com", // фото товаров и промо-слайдов
            "https://images.unsplash.com", // фото в секции "О магазине" на главной
          ],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'self'"],
        },
      },
      crossOriginResourcePolicy: false,
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // статические файлы сайта (каталог, админ-панель, ассеты)
  app.use(express.static(path.join(__dirname, "..", "public")));

  // API
  app.use("/api/auth", authRoutes);
  app.use("/api/products", productsRoutes);
  app.use("/api/admin/products", adminProductsRoutes);
  app.use("/api/orders", ordersRoutes);
  app.use("/api/admin/orders", adminOrdersRoutes);
  app.use("/api/promo-slides", promoSlidesRoutes);
  app.use("/api/admin/promo-slides", adminPromoSlidesRoutes);

  // удобный редирект: royalfish.tj/admin -> страница входа
  app.get("/admin", (req, res) => res.redirect("/admin/login.html"));

  // единый обработчик ошибок для /api/* — отдаём JSON, а не HTML-страницу с трейсом
  app.use("/api", (err, req, res, next) => {
    console.error("[api error]", err);
    res.status(500).json({ error: "Внутренняя ошибка сервера. Попробуйте ещё раз." });
  });

  // 404 — отдаём главную страницу каталога
  app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, "..", "public", "index.html"));
  });

  return app;
}

module.exports = createApp;
