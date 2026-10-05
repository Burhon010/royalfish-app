const { verifyPartnerToken } = require("../auth");
const partners = require("../partners");

/* Кабинет ресторана. Статус и данные ресторана каждый раз читаются из
   базы — блокировка администратором действует сразу, без ожидания
   окончания сессии. Идентификатор ресторана берётся ТОЛЬКО из
   подписанного токена, а не из параметров запроса. */
async function loadPartner(req, res) {
  const data = verifyPartnerToken(req.cookies && req.cookies.rf_partner);
  if (!data) {
    res.status(401).json({ error: "Сессия истекла. Пожалуйста, войдите заново." });
    return null;
  }
  const restaurant = await partners.getRestaurantById(data.sub);
  if (!restaurant) {
    res.status(401).json({ error: "Аккаунт не найден." });
    return null;
  }
  return restaurant;
}

function requirePartner(req, res, next) {
  loadPartner(req, res)
    .then((restaurant) => {
      if (!restaurant) return;
      req.restaurant = restaurant;
      next();
    })
    .catch(next);
}

function requireApprovedPartner(req, res, next) {
  requirePartner(req, res, (err) => {
    if (err) return next(err);
    if (req.restaurant.status !== "approved") {
      return res.status(403).json({ error: "Доступ к оптовому кабинету ещё не открыт администратором." });
    }
    next();
  });
}

module.exports = { requirePartner, requireApprovedPartner };
