const { verify } = require("../auth");

module.exports = function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.rf_session;
  const data = verify(token);

  if (!data) {
    return res.status(401).json({ error: "Сессия истекла. Пожалуйста, войдите заново." });
  }

  req.admin = data;
  next();
};
