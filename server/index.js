require("dotenv").config();

const createApp = require("./app");
const db = require("./db"); // подключение к БД + сид администратора/товаров (init() — асинхронный)

const PORT = process.env.PORT || 3000;

/* Точка входа для обычного сервера — Render, VPS, локальный запуск.
   Для Vercel используется отдельный вход: api/index.js (serverless,
   без app.listen — см. комментарии там и в server/app.js). */
async function start() {
  // ждём, пока установится соединение с БД, создастся схема и сидируются
  // администратор/демо-товары — только после этого начинаем принимать трафик.
  await db.init();

  const app = createApp();

  app.listen(PORT, () => {
    console.log(`Royal Fish запущен: http://localhost:${PORT}`);
    console.log(`Админ-панель:       http://localhost:${PORT}/admin`);
  });
}

start().catch((err) => {
  console.error("Не удалось запустить сервер (проверьте DATABASE_URL):", err);
  process.exit(1);
});
