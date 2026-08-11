/* ============================================================
   Простой rate limit по IP (in-memory), без внешних зависимостей.

   Это тот же подход, что уже использовался в auth.routes.js для
   защиты /api/auth/login от перебора пароля — здесь он просто
   вынесен в переиспользуемый middleware, чтобы применить к другим
   публичным эндпоинтам (заказы, каталог) без добавления новой
   npm-зависимости (express-rate-limit и т.п.).

   Ограничение: счётчики хранятся в памяти процесса — на нескольких
   инстансах сервера одновременно (несколько серверов за балансиром)
   каждый считал бы отдельно. Для одного процесса (Render/VPS/
   локально/Vercel-функция) этого достаточно, как и раньше.
   ============================================================ */

function createRateLimiter({ windowMs, max, message }) {
  var hits = new Map();

  // Периодически подчищаем устаревшие записи (IP, которые давно
  // не стучались) — иначе Map бы бесконечно рос на боевом сайте,
  // куда заходят с разных адресов (в т.ч. боты/сканеры).
  var sweepTimer = setInterval(function () {
    var now = Date.now();
    hits.forEach(function (rec, ip) {
      if (now - rec.first > windowMs) hits.delete(ip);
    });
  }, windowMs);
  if (typeof sweepTimer.unref === "function") sweepTimer.unref();

  return function rateLimit(req, res, next) {
    var ip = req.ip;
    var now = Date.now();
    var rec = hits.get(ip);

    if (!rec || now - rec.first > windowMs) {
      rec = { count: 0, first: now };
      hits.set(ip, rec);
    }
    rec.count += 1;

    var remaining = Math.max(0, max - rec.count);
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));

    if (rec.count > max) {
      var retryAfterSec = Math.max(1, Math.ceil((rec.first + windowMs - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        error: message || "Слишком много запросов. Попробуйте немного позже.",
      });
    }

    next();
  };
}

module.exports = { createRateLimiter };
