const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

/* ============================================================
   Подключение к внешней базе данных Postgres
   (Neon, Supabase — подходит любой сервис с обычной строкой
   подключения). Строка берётся из переменной окружения
   DATABASE_URL — задайте её в .env локально и в настройках
   сервиса на хостинге (Render → Environment).

   Почему так: бесплатный тариф Render не даёт постоянный диск —
   локальные файлы стираются при каждом "засыпании"/перезапуске
   сервиса. Внешняя БД живёт отдельно от сервера и не зависит
   от его перезапусков.
   ============================================================ */

if (!process.env.DATABASE_URL) {
  console.warn(
    "[внимание] DATABASE_URL не задан — соединение с базой данных не установить. " +
    "Добавьте DATABASE_URL в .env (локально) или в Environment вашего сервиса на Render."
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon и Supabase требуют SSL; сертификат обычно самоподписанный на
  // уровне пула соединений, поэтому проверку цепочки отключаем.
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});

pool.on("error", (err) => {
  console.error("[db] неожиданная ошибка соединения с базой данных:", err);
});

/* ============================================================
   Схема — создаётся автоматически при старте, если ещё нет.
   ============================================================ */

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS products (
      id                SERIAL PRIMARY KEY,
      name              TEXT NOT NULL,
      category          TEXT NOT NULL CHECK (category IN ('fish','shrimp','squid','caviar','delicacy','lobster','other')),
      weight            TEXT NOT NULL,
      price             NUMERIC NOT NULL CHECK (price >= 0),
      discount_percent  INTEGER NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 90),
      final_price       NUMERIC NOT NULL DEFAULT 0,
      is_new            BOOLEAN NOT NULL DEFAULT false,
      in_stock          BOOLEAN NOT NULL DEFAULT true,
      image_path        TEXT,
      image_public_id   TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- на случай, если таблица products уже существовала до этого поля
    -- (например, до подключения облачного хранилища фото)
    ALTER TABLE products ADD COLUMN IF NOT EXISTS image_public_id TEXT;

    -- ------------------------------------------------------------
    -- Оптовый каталог "Для ресторанов" (см. README, раздел про опт).
    -- Один и тот же товар может продаваться и в розницу, и оптом —
    -- поэтому это просто дополнительные колонки в той же таблице
    -- products, а не отдельная таблица. Розничные price/discount_percent/
    -- final_price выше не трогаем — это по-прежнему "розничная цена".
    -- ------------------------------------------------------------
    ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_min_qty INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS available_retail BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS available_wholesale BOOLEAN NOT NULL DEFAULT false;

    -- admins.role: колонка осталась от разработки системы ролей, от
    -- которой в итоге отказались (сейчас у любого администратора полный
    -- доступ, код нигде role не читает и не проверяет). Оставлена в схеме
    -- как есть (просто лишняя колонка со значением по умолчанию) — так
    -- проще и безопаснее для уже работающей базы, чем делать DROP COLUMN.
    ALTER TABLE admins ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin';
  `);

  // Отдельно — CHECK-ограничения на новые колонки (DROP IF EXISTS + ADD,
  // тот же приём, что и для category ниже — безопасно перезапускать при
  // каждом старте, существующие данные не трогает).
  await pool.query(`
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_wholesale_price_check;
    ALTER TABLE products ADD CONSTRAINT products_wholesale_price_check
      CHECK (wholesale_price IS NULL OR wholesale_price >= 0);

    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_wholesale_min_qty_check;
    ALTER TABLE products ADD CONSTRAINT products_wholesale_min_qty_check
      CHECK (wholesale_min_qty >= 1);

    ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_check;
    ALTER TABLE admins ADD CONSTRAINT admins_role_check
      CHECK (role IN ('admin','manager','sales','smm'));
  `);

  // Расширяем список допустимых категорий (добавлены "Лобстеры" = 'lobster'
  // и ранее "Другие" = 'other'). Пересоздаём CHECK-ограничение —
  // существующие товары и их категории не трогаем.
  await pool.query(`
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_category_check;
    ALTER TABLE products ADD CONSTRAINT products_category_check
      CHECK (category IN ('fish','shrimp','squid','caviar','delicacy','lobster','other'));
  `);

  // ------------------------------------------------------------
  // Заказы. Отдельные таблицы, никак не пересекаются с товарами
  // напрямую — product_id может стать NULL, если товар потом
  // удалят, но название/цена в заказе уже сохранены "снимком"
  // на момент покупки и не изменятся задним числом.
  // ------------------------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id                SERIAL PRIMARY KEY,
      customer_name     TEXT NOT NULL,
      customer_phone    TEXT NOT NULL,
      customer_address  TEXT,
      comment           TEXT,
      total_amount      NUMERIC NOT NULL DEFAULT 0,
      status            TEXT NOT NULL DEFAULT 'new'
                         CHECK (status IN ('new','processing','delivering','completed')),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Оптовые заказы ресторанов (см. раздел "Для ресторанов") идут в те же
    -- таблицы orders/order_items, что и розничные — order_type просто
    -- помечает, какой это заказ, а company_name хранит название ресторана
    -- (для розницы остаётся NULL). Так статусы/история/админка заказов
    -- общие для обоих потоков, ничего не дублируется.
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'retail';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS company_name TEXT;

    CREATE TABLE IF NOT EXISTS order_items (
      id            SERIAL PRIMARY KEY,
      order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name  TEXT NOT NULL,
      unit_price    NUMERIC NOT NULL,
      quantity      INTEGER NOT NULL CHECK (quantity > 0),
      subtotal      NUMERIC NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
  `);

  await pool.query(`
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
    ALTER TABLE orders ADD CONSTRAINT orders_order_type_check
      CHECK (order_type IN ('retail','wholesale'));
  `);

  // ------------------------------------------------------------
  // Рекламный слайдер на главной странице. Специально не ограничено
  // ровно тремя слайдами на уровне БД — sort_order/is_active
  // позволяют владельцу в будущем добавить больше, если понадобится.
  // ------------------------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS promo_slides (
      id                SERIAL PRIMARY KEY,
      image_path        TEXT NOT NULL,
      image_public_id   TEXT,
      title             TEXT,
      sort_order         INTEGER NOT NULL DEFAULT 0,
      is_active         BOOLEAN NOT NULL DEFAULT true,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_promo_slides_sort_order ON promo_slides(sort_order);
  `);
}

/* ============================================================
   Администраторы
   ============================================================ */

async function getAdminByUsername(username) {
  const { rows } = await pool.query("SELECT * FROM admins WHERE username = $1", [username]);
  return rows[0] || null;
}

async function getAdminById(id) {
  const { rows } = await pool.query("SELECT * FROM admins WHERE id = $1", [id]);
  return rows[0] || null;
}

async function updateAdminPassword(id, passwordHash) {
  await pool.query("UPDATE admins SET password_hash = $1 WHERE id = $2", [passwordHash, id]);
}

async function seedAdminIfNeeded(username, password) {
  const existing = await getAdminByUsername(username);
  if (!existing) {
    const hash = bcrypt.hashSync(password, 12);
    await pool.query(
      "INSERT INTO admins (username, password_hash) VALUES ($1, $2)",
      [username, hash]
    );
    console.log(
      `[seed] Создан администратор "${username}". ОБЯЗАТЕЛЬНО смените пароль после первого входа в разделе "Сменить пароль".`
    );
  }
}

/* ============================================================
   Товары
   ============================================================ */

async function getAllProducts() {
  const { rows } = await pool.query("SELECT * FROM products ORDER BY created_at DESC");
  return rows;
}

// Публичный розничный каталог — только товары, включённые владельцем в
// розницу. wholesale_price здесь не фильтруется отдельно: розничный
// маршрут (server/routes/products.routes.js) в любом случае не отдаёт
// это поле клиенту, но фильтр по available_retail сам по себе уже не
// показывает опт-only товары обычным покупателям.
async function getRetailProducts() {
  const { rows } = await pool.query(
    "SELECT * FROM products WHERE available_retail = true ORDER BY created_at DESC"
  );
  return rows;
}

// Публичный оптовый каталог "Для ресторанов" — только товары, явно
// включённые владельцем в опт (available_wholesale = true). Товар без
// назначенной оптовой цены в опте не показываем, даже если флаг стоит —
// защита от пустой/некорректной карточки, если цену забыли заполнить.
async function getWholesaleProducts() {
  const { rows } = await pool.query(
    "SELECT * FROM products WHERE available_wholesale = true AND wholesale_price IS NOT NULL ORDER BY created_at DESC"
  );
  return rows;
}

async function getProductById(id) {
  const { rows } = await pool.query("SELECT * FROM products WHERE id = $1", [id]);
  return rows[0] || null;
}

async function createProduct(data) {
  const { rows } = await pool.query(
    `INSERT INTO products
       (name, category, weight, price, discount_percent, final_price, is_new, in_stock,
        image_path, image_public_id, description, wholesale_price, wholesale_min_qty,
        available_retail, available_wholesale)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      data.name,
      data.category,
      data.weight,
      data.price,
      data.discount_percent,
      data.final_price,
      Boolean(data.is_new),
      Boolean(data.in_stock),
      data.image_path || null,
      data.image_public_id || null,
      data.description || null,
      data.wholesale_price === undefined || data.wholesale_price === null ? null : data.wholesale_price,
      data.wholesale_min_qty || 1,
      data.available_retail === undefined ? true : Boolean(data.available_retail),
      Boolean(data.available_wholesale),
    ]
  );
  return rows[0];
}

async function updateProduct(id, data) {
  // Собираем частичное обновление — обновляем только переданные поля,
  // как и раньше делал JSON-стор (Object.assign поверх старой записи).
  const fields = [];
  const values = [];
  let i = 1;

  const columnMap = {
    name: "name",
    category: "category",
    weight: "weight",
    price: "price",
    discount_percent: "discount_percent",
    final_price: "final_price",
    is_new: "is_new",
    in_stock: "in_stock",
    image_path: "image_path",
    image_public_id: "image_public_id",
    description: "description",
    wholesale_price: "wholesale_price",
    wholesale_min_qty: "wholesale_min_qty",
    available_retail: "available_retail",
    available_wholesale: "available_wholesale",
  };
  const booleanColumns = new Set(["is_new", "in_stock", "available_retail", "available_wholesale"]);

  for (const key of Object.keys(data)) {
    if (!(key in columnMap)) continue;
    let value = data[key];
    if (booleanColumns.has(key)) value = Boolean(value);
    fields.push(`${columnMap[key]} = $${i}`);
    values.push(value);
    i += 1;
  }

  if (!fields.length) return getProductById(id);

  fields.push(`updated_at = now()`);
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE products SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  return rows[0] || null;
}

async function deleteProduct(id) {
  await pool.query("DELETE FROM products WHERE id = $1", [id]);
}

async function seedProductsIfEmpty(items) {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM products");
  if (rows[0].count > 0) return;

  for (const item of items) {
    await pool.query(
      `INSERT INTO products
         (name, category, weight, price, discount_percent, final_price, is_new, in_stock, image_path)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        item.name,
        item.category,
        item.weight,
        item.price,
        item.discount_percent,
        item.final_price,
        Boolean(item.is_new),
        Boolean(item.in_stock),
        item.image_path || null,
      ]
    );
  }
  console.log(`[seed] Добавлено демо-товаров: ${items.length}.`);
}

/* ============================================================
   Заказы
   ------------------------------------------------------------
   Цену каждой позиции сервер всегда берёт из текущей записи
   товара в базе (product.final_price) в момент оформления —
   клиенту нельзя прислать свою цену. Название и цена сохраняются
   "снимком" в order_items, поэтому история заказов не меняется
   задним числом, даже если товар потом отредактируют или удалят.
   ============================================================ */

const ORDER_STATUSES = ["new", "processing", "delivering", "completed"];
const ORDER_TYPES = ["retail", "wholesale"];

async function createOrder({
  customerName,
  customerPhone,
  customerAddress,
  comment,
  items,
  orderType,
  companyName,
}) {
  const type = orderType === "wholesale" ? "wholesale" : "retail";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let total = 0;
    const resolvedItems = [];

    for (const item of items) {
      const { rows } = await client.query("SELECT * FROM products WHERE id = $1", [item.productId]);
      const product = rows[0];
      if (!product) {
        const err = new Error(`Товар (id=${item.productId}) не найден — возможно, его уже удалили.`);
        err.statusCode = 400;
        throw err;
      }
      if (!product.in_stock) {
        const err = new Error(`Товар «${product.name}» сейчас нет в наличии.`);
        err.statusCode = 400;
        throw err;
      }

      let unitPrice;
      if (type === "wholesale") {
        if (!product.available_wholesale || product.wholesale_price === null) {
          const err = new Error(`Товар «${product.name}» недоступен в оптовом каталоге.`);
          err.statusCode = 400;
          throw err;
        }
        const minQty = product.wholesale_min_qty || 1;
        if (item.quantity < minQty) {
          const err = new Error(
            `Минимальный заказ для «${product.name}» — ${minQty} шт. Увеличьте количество.`
          );
          err.statusCode = 400;
          throw err;
        }
        unitPrice = Number(product.wholesale_price);
      } else {
        if (!product.available_retail) {
          const err = new Error(`Товар «${product.name}» сейчас недоступен для розничного заказа.`);
          err.statusCode = 400;
          throw err;
        }
        unitPrice = Number(product.final_price);
      }

      const quantity = item.quantity;
      const subtotal = Math.round(unitPrice * quantity * 100) / 100;
      total += subtotal;

      resolvedItems.push({
        product_id: product.id,
        product_name: product.name,
        unit_price: unitPrice,
        quantity,
        subtotal,
      });
    }

    total = Math.round(total * 100) / 100;

    const orderRes = await client.query(
      `INSERT INTO orders (customer_name, customer_phone, customer_address, comment, total_amount, order_type, company_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        customerName,
        customerPhone,
        customerAddress || null,
        comment || null,
        total,
        type,
        companyName || null,
      ]
    );
    const order = orderRes.rows[0];

    for (const item of resolvedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [order.id, item.product_id, item.product_name, item.unit_price, item.quantity, item.subtotal]
      );
    }

    await client.query("COMMIT");

    order.items = resolvedItems;
    return order;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function getAllOrders() {
  const { rows } = await pool.query(`
    SELECT o.*, COALESCE(COUNT(oi.id), 0)::int AS items_count
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    GROUP BY o.id
    ORDER BY o.created_at DESC
  `);
  return rows;
}

async function getOrderById(id) {
  const orderRes = await pool.query("SELECT * FROM orders WHERE id = $1", [id]);
  const order = orderRes.rows[0];
  if (!order) return null;

  const itemsRes = await pool.query(
    "SELECT * FROM order_items WHERE order_id = $1 ORDER BY id",
    [id]
  );
  order.items = itemsRes.rows;
  return order;
}

async function updateOrderStatus(id, status) {
  const { rows } = await pool.query(
    "UPDATE orders SET status = $1, updated_at = now() WHERE id = $2 RETURNING *",
    [status, id]
  );
  return rows[0] || null;
}

/* ============================================================
   Рекламный слайдер на главной
   ============================================================ */

// Публичный сайт — только активные слайды, по порядку.
async function getActivePromoSlides() {
  const { rows } = await pool.query(
    "SELECT * FROM promo_slides WHERE is_active = true ORDER BY sort_order ASC, id ASC"
  );
  return rows;
}

// Админка — вообще все слайды (в т.ч. выключенные), чтобы ими управлять.
async function getAllPromoSlides() {
  const { rows } = await pool.query(
    "SELECT * FROM promo_slides ORDER BY sort_order ASC, id ASC"
  );
  return rows;
}

async function getPromoSlideById(id) {
  const { rows } = await pool.query("SELECT * FROM promo_slides WHERE id = $1", [id]);
  return rows[0] || null;
}

async function createPromoSlide(data) {
  const { rows: maxRows } = await pool.query(
    "SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM promo_slides"
  );
  const nextOrder = Number(maxRows[0].max_order) + 1;

  const { rows } = await pool.query(
    `INSERT INTO promo_slides (image_path, image_public_id, title, sort_order, is_active)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [data.image_path, data.image_public_id || null, data.title || null, nextOrder, true]
  );
  return rows[0];
}

async function updatePromoSlide(id, data) {
  const fields = [];
  const values = [];
  let i = 1;

  const columnMap = {
    image_path: "image_path",
    image_public_id: "image_public_id",
    title: "title",
    is_active: "is_active",
    sort_order: "sort_order",
  };

  for (const key of Object.keys(data)) {
    if (!(key in columnMap)) continue;
    let value = data[key];
    if (key === "is_active") value = Boolean(value);
    fields.push(`${columnMap[key]} = $${i}`);
    values.push(value);
    i += 1;
  }

  if (!fields.length) return getPromoSlideById(id);

  fields.push("updated_at = now()");
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE promo_slides SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  return rows[0] || null;
}

async function deletePromoSlide(id) {
  await pool.query("DELETE FROM promo_slides WHERE id = $1", [id]);
}

// Сдвигает слайд вверх/вниз в списке — меняет местами sort_order
// с соседним слайдом (по всему списку, включая выключенные, чтобы
// порядок оставался предсказуемым, даже если часть слайдов скрыта).
// Обе записи обновляются в одной транзакции — если что-то пойдёт не
// так между двумя UPDATE, оба изменения откатятся, а не оставят
// два слайда с одинаковым sort_order.
async function movePromoSlide(id, direction) {
  const all = await getAllPromoSlides();
  const index = all.findIndex((s) => s.id === id);
  if (index === -1) return null;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= all.length) return all[index]; // уже с краю — двигать некуда

  const current = all[index];
  const neighbor = all[targetIndex];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE promo_slides SET sort_order = $1, updated_at = now() WHERE id = $2", [
      neighbor.sort_order,
      current.id,
    ]);
    await client.query("UPDATE promo_slides SET sort_order = $1, updated_at = now() WHERE id = $2", [
      current.sort_order,
      neighbor.id,
    ]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return getPromoSlideById(id);
}

module.exports = {
  pool,
  initSchema,
  getAdminByUsername,
  getAdminById,
  updateAdminPassword,
  seedAdminIfNeeded,
  getAllProducts,
  getRetailProducts,
  getWholesaleProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  seedProductsIfEmpty,
  ORDER_STATUSES,
  ORDER_TYPES,
  createOrder,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  getActivePromoSlides,
  getAllPromoSlides,
  getPromoSlideById,
  createPromoSlide,
  updatePromoSlide,
  deletePromoSlide,
  movePromoSlide,
};
