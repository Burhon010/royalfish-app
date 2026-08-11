const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { createSessionToken, TOKEN_TTL_MS } = require("../auth");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

/* ----------------------------------------------------------
   Простая защита от перебора пароля (in-memory, по IP).
   Для продакшена с несколькими серверами замените на Redis.
   ---------------------------------------------------------- */
const attempts = new Map();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

function tooManyAttempts(ip) {
  const rec = attempts.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > WINDOW_MS) {
    attempts.delete(ip);
    return false;
  }
  return rec.count >= MAX_ATTEMPTS;
}
function registerAttempt(ip) {
  const rec = attempts.get(ip);
  if (!rec || Date.now() - rec.first > WINDOW_MS) {
    attempts.set(ip, { count: 1, first: Date.now() });
  } else {
    rec.count += 1;
  }
}
function clearAttempts(ip) {
  attempts.delete(ip);
}

router.post("/login", async (req, res, next) => {
  try {
    const ip = req.ip;

    if (tooManyAttempts(ip)) {
      return res
        .status(429)
        .json({ error: "Слишком много попыток входа. Попробуйте снова через несколько минут." });
    }

    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Введите логин и пароль." });
    }

    const admin = await db.getAdminByUsername(username);
    const ok = admin && bcrypt.compareSync(password, admin.password_hash);

    if (!ok) {
      registerAttempt(ip);
      return res.status(401).json({ error: "Неверный логин или пароль." });
    }

    clearAttempts(ip);
    const token = createSessionToken(admin.id, admin.username);

    res.cookie("rf_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: TOKEN_TTL_MS,
      path: "/",
    });

    res.json({ ok: true, username: admin.username });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("rf_session", { path: "/" });
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ username: req.admin.username });
});

router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Заполните оба поля." });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Новый пароль должен быть не короче 8 символов." });
    }

    const admin = await db.getAdminById(req.admin.sub);
    if (!admin || !bcrypt.compareSync(currentPassword, admin.password_hash)) {
      return res.status(401).json({ error: "Текущий пароль указан неверно." });
    }

    const hash = bcrypt.hashSync(newPassword, 12);
    await db.updateAdminPassword(admin.id, hash);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
