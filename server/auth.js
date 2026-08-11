const crypto = require("crypto");

const SECRET = process.env.SESSION_SECRET || "insecure-dev-secret-change-me";
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 часов

if (SECRET === "insecure-dev-secret-change-me" && process.env.NODE_ENV === "production") {
  console.warn(
    "[внимание] SESSION_SECRET не задан в .env — используется небезопасное значение по умолчанию!"
  );
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

/**
 * Подписывает объект в компактный токен вида "payload.signature".
 */
function sign(payloadObj) {
  const payload = base64url(JSON.stringify(payloadObj));
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

/**
 * Проверяет подпись и срок действия токена.
 * Возвращает распакованные данные или null, если токен недействителен.
 */
function verify(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;

  const [payload, signature] = token.split(".");
  const expectedSignature = crypto
    .createHmac("sha256", SECRET)
    .update(payload)
    .digest("base64url");

  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function createSessionToken(adminId, username) {
  return sign({ sub: adminId, username, exp: Date.now() + TOKEN_TTL_MS });
}

module.exports = { createSessionToken, verify, TOKEN_TTL_MS };
