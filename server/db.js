const store = require("./store");

/* ----------------------------------------------------------
   Защита от запуска в production с небезопасным паролем
   администратора. Проверяются только сам факт "пароль слабый/
   дефолтный", а не его значение — само значение ADMIN_PASSWORD
   нигде здесь не логируется.

   В разработке (NODE_ENV !== "production", в т.ч. локально) не
   блокирует ничего — иначе сломался бы обычный "npm start" с
   .env, где ADMIN_PASSWORD/значение по умолчанию не так важны.
   ---------------------------------------------------------- */
const MIN_ADMIN_PASSWORD_LENGTH = 8;
const KNOWN_INSECURE_ADMIN_PASSWORDS = new Set([
  "royalfish2026", // дефолт этого файла, если ADMIN_PASSWORD вообще не задан
  "change-this-password-now", // плейсхолдер из .env.example
]);

function assertAdminPasswordIsSafeForProduction(password) {
  if (process.env.NODE_ENV !== "production") return;

  const value = password || "";
  const isMissing = !value;
  const isKnownDefault = KNOWN_INSECURE_ADMIN_PASSWORDS.has(value);
  const isTooShort = value.length < MIN_ADMIN_PASSWORD_LENGTH;

  if (isMissing || isKnownDefault || isTooShort) {
    throw new Error(
      "Небезопасно запускать сервер в production с пустым/дефолтным/слишком коротким " +
      "ADMIN_PASSWORD (минимум " + MIN_ADMIN_PASSWORD_LENGTH + " символов, не значение из .env.example). " +
      "Задайте надёжный пароль в переменных окружения хостинга и перезапустите сервер."
    );
  }
}

/* ----------------------------------------------------------
   Инициализация базы данных: создаём таблицы (если их ещё нет),
   сидируем администратора и демо-товары.
   Вызывается один раз при старте сервера — см. server/index.js.
   ---------------------------------------------------------- */
async function init() {
  await store.initSchema();

  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD || "royalfish2026";

  assertAdminPasswordIsSafeForProduction(adminPassword);

  await store.seedAdminIfNeeded(adminUsername, adminPassword);

  await store.seedProductsIfEmpty([
    {
      name: "Лосось охлаждённый",
      category: "fish",
      weight: "1 кг",
      price: 280,
      discount_percent: 0,
      final_price: 280,
      is_new: 1,
      in_stock: 1,
      image_path:
        "https://images.unsplash.com/photo-1499125562588-29fb8a56b5d5?auto=format&fit=crop&w=900&q=70",
    },
    {
      name: "Креветки королевские",
      category: "shrimp",
      weight: "1 кг",
      price: 250,
      discount_percent: 15,
      final_price: 212.5,
      is_new: 0,
      in_stock: 1,
      image_path:
        "https://images.unsplash.com/photo-1548587468-971ebe4c8c3b?auto=format&fit=crop&w=900&q=70",
    },
    {
      name: "Икра красная",
      category: "caviar",
      weight: "250 г",
      price: 180,
      discount_percent: 0,
      final_price: 180,
      is_new: 0,
      in_stock: 1,
      image_path:
        "https://images.unsplash.com/photo-1728335026927-8ee0382ada94?auto=format&fit=crop&w=900&q=70",
    },
    {
      name: "Кальмар очищенный",
      category: "squid",
      weight: "1 кг",
      price: 120,
      discount_percent: 0,
      final_price: 120,
      is_new: 0,
      in_stock: 0,
      image_path:
        "https://images.unsplash.com/photo-1567941537651-70be5a2aafd2?auto=format&fit=crop&w=900&q=70",
    },
    {
      name: "Дорадо свежая",
      category: "fish",
      weight: "1 кг",
      price: 200,
      discount_percent: 0,
      final_price: 200,
      is_new: 1,
      in_stock: 1,
      image_path:
        "https://images.unsplash.com/photo-1510130387422-82bed34b37e9?auto=format&fit=crop&w=900&q=70",
    },
    {
      name: "Морской коктейль ассорти",
      category: "delicacy",
      weight: "400 г",
      price: 150,
      discount_percent: 0,
      final_price: 150,
      is_new: 0,
      in_stock: 1,
      image_path:
        "https://images.unsplash.com/photo-1632389879997-330b17bf1923?auto=format&fit=crop&w=900&q=70",
    },
  ]);
}

module.exports = { ...store, init };
