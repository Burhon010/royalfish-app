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
    const newUsername = String((req.body && req.body.newUsername) || "").trim();

    if (!currentPassword) {
      return res.status(400).json({ error: "Введите текущий пароль." });
    }
    if (!newPassword && !newUsername) {
      return res.status(400).json({ error: "Укажите новый логин или новый пароль." });
    }
    if (newPassword && newPassword.length < 8) {
      return res.status(400).json({ error: "Новый пароль должен быть не короче 8 символов." });
    }
    if (newUsername && (newUsername.length < 3 || newUsername.length > 40)) {
      return res.status(400).json({ error: "Логин должен быть от 3 до 40 символов." });
    }

    const admin = await db.getAdminById(req.admin.sub);
    if (!admin || !bcrypt.compareSync(currentPassword, admin.password_hash)) {
      return res.status(401).json({ error: "Текущий пароль указан неверно." });
    }

    if (newUsername && newUsername !== admin.username) {
      const taken = await db.getAdminByUsername(newUsername);
      if (taken && taken.id !== admin.id) {
        return res.status(400).json({ error: "Такой логин уже занят." });
      }
    }

    const finalUsername = newUsername && newUsername !== admin.username ? newUsername : null;
    const hash = newPassword ? bcrypt.hashSync(newPassword, 12) : null;
    await db.updateAdminCredentials(admin.id, { username: finalUsername, passwordHash: hash });

    // В токене сессии зашит логин — выдаём новый, чтобы не разлогинило.
    const username = finalUsername || admin.username;
    res.cookie("rf_session", createSessionToken(admin.id, username), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: TOKEN_TTL_MS,
      path: "/",
    });

    res.json({ ok: true, username });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
