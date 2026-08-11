const createApp = require("../server/app");
const db = require("../server/db");

/* ============================================================
   Точка входа для Vercel (serverless).

   На Vercel нет постоянно работающего процесса: каждый "холодный"
   контейнер поднимается заново на первый запрос и может быть
   переиспользован для следующих (пока не заснёт). Поэтому:

     - app.listen() здесь не нужен и не должен вызываться —
       Vercel сам принимает HTTP-запросы и передаёт их в этот файл.
     - db.init() (создание таблиц + сид админа/товаров) нельзя
       просто вызвать один раз при старте сервера, как в
       server/index.js — такой "старт" на Vercel не гарантирован.
       Вместо этого делаем ленивую инициализацию: при первом
       запросе в контейнере — дожидаемся db.init() и собираем
       app, при последующих запросах в том же (уже тёплом)
       контейнере — переиспользуем готовый app без повторной
       инициализации.
   ============================================================ */

let appReadyPromise = null;

function getApp() {
  if (!appReadyPromise) {
    appReadyPromise = db.init().then(() => createApp());
  }
  return appReadyPromise;
}

module.exports = async (req, res) => {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (err) {
    console.error("[vercel] ошибка инициализации приложения:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Сервер временно недоступен. Проверьте переменные окружения (DATABASE_URL и др.) в настройках проекта на Vercel." }));
  }
};
