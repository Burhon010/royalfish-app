/* ============================================================
   Оптовый портал для ресторанов/кафе: аккаунты ресторанов, группы
   цен, индивидуальные цены и оптовые заказы блоками.

   Всё лежит в отдельных таблицах и никак не пересекается с
   розничными заказами (таблицы orders/order_items) и розничными
   ценами товаров.

   Цена "за блок" нигде не хранится у товара отдельно — базовая цена
   блока вычисляется как wholesale_price (за штуку) × wholesale_min_qty
   (штук в блоке). Группы цен и индивидуальные цены хранят уже
   готовую цену ЗА БЛОК.

   Приоритет цены для ресторана:
     1) индивидуальная цена ресторана
     2) цена его группы
     3) базовая оптовая цена
   ============================================================ */

const bcrypt = require("bcryptjs");
const { pool } = require("./store");
const { encryptSecret, decryptSecret } = require("./auth");

const RESTAURANT_STATUSES = ["pending", "approved", "rejected", "blocked"];
const WHOLESALE_ORDER_STATUSES = [
  "awaiting",
  "confirmed",
  "rejected",
  "processing",
  "ready",
  "completed",
  "cancelled",
];

const MAX_BLOCKS_PER_ITEM = 999;
const MAX_ITEMS_PER_ORDER = 100;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function orderNumber(id) {
  return "RF-" + String(id).padStart(6, "0");
}

/* ----------------------------------------------------------
   Схема
   ---------------------------------------------------------- */
async function initPartnerSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS price_groups (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS price_group_prices (
      group_id    INTEGER NOT NULL REFERENCES price_groups(id) ON DELETE CASCADE,
      product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      price       NUMERIC NOT NULL CHECK (price >= 0),   -- цена ЗА БЛОК
      PRIMARY KEY (group_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS restaurants (
      id              SERIAL PRIMARY KEY,
      name            TEXT NOT NULL,
      phone           TEXT NOT NULL,
      address         TEXT NOT NULL,
      password_hash   TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','approved','rejected','blocked')),
      price_group_id  INTEGER REFERENCES price_groups(id) ON DELETE SET NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS password_enc TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS restaurants_name_lower_idx ON restaurants (lower(name));

    CREATE TABLE IF NOT EXISTS restaurant_prices (
      restaurant_id  INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      price          NUMERIC NOT NULL CHECK (price >= 0),   -- цена ЗА БЛОК
      PRIMARY KEY (restaurant_id, product_id)
    );

    -- Товары, скрытые владельцем для конкретного ресторана (не видны в его
    -- каталоге и не доступны для заказа).
    CREATE TABLE IF NOT EXISTS restaurant_hidden_products (
      restaurant_id  INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      PRIMARY KEY (restaurant_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS wholesale_orders (
      id                  SERIAL PRIMARY KEY,
      restaurant_id       INTEGER REFERENCES restaurants(id) ON DELETE SET NULL,
      restaurant_name     TEXT NOT NULL,      -- снимок на момент заказа
      restaurant_phone    TEXT NOT NULL,
      restaurant_address  TEXT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'awaiting'
                           CHECK (status IN ('awaiting','confirmed','rejected','processing','ready','completed','cancelled')),
      customer_comment    TEXT,
      admin_comment       TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS wholesale_order_items (
      id               SERIAL PRIMARY KEY,
      order_id         INTEGER NOT NULL REFERENCES wholesale_orders(id) ON DELETE CASCADE,
      product_id       INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name     TEXT NOT NULL,
      units_per_block  INTEGER NOT NULL CHECK (units_per_block >= 1),
      price_per_block  NUMERIC NOT NULL,     -- цена на момент заказа
      ordered_blocks   INTEGER NOT NULL CHECK (ordered_blocks > 0),   -- что заказал ресторан (не меняется)
      confirmed_blocks INTEGER CHECK (confirmed_blocks IS NULL OR confirmed_blocks >= 0) -- что подтвердил сотрудник
    );
    CREATE INDEX IF NOT EXISTS idx_wholesale_items_order ON wholesale_order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_wholesale_orders_restaurant ON wholesale_orders(restaurant_id);
  `);

  // Стартовые группы цен — один раз; если администратор потом их удалит,
  // заново они не появятся.
  const { rows } = await pool.query("SELECT 1 FROM settings WHERE key = 'price_groups_seeded'");
  if (!rows.length) {
    for (const name of ["Standard", "Premium", "VIP"]) {
      await pool.query("INSERT INTO price_groups (name) VALUES ($1) ON CONFLICT DO NOTHING", [name]);
    }
    await pool.query("INSERT INTO settings (key, value) VALUES ('price_groups_seeded', '1') ON CONFLICT DO NOTHING");
  }
}

/* ----------------------------------------------------------
   Рестораны
   ---------------------------------------------------------- */
async function registerRestaurant({ name, phone, address, password }) {
  const hash = bcrypt.hashSync(password, 12);
  try {
    const { rows } = await pool.query(
      `INSERT INTO restaurants (name, phone, address, password_hash, password_enc)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, phone, address, hash, encryptSecret(password)]
    );
    return rows[0];
  } catch (err) {
    if (err.code === "23505") {
      const e = new Error("Ресторан с таким названием уже зарегистрирован.");
      e.statusCode = 400;
      throw e;
    }
    throw err;
  }
}

async function getRestaurantByName(name) {
  const { rows } = await pool.query("SELECT * FROM restaurants WHERE lower(name) = lower($1)", [name]);
  return rows[0] || null;
}

async function getRestaurantById(id) {
  const { rows } = await pool.query(
    `SELECT r.*, g.name AS price_group_name,
            (SELECT COUNT(*)::int FROM wholesale_orders o WHERE o.restaurant_id = r.id) AS orders_count
     FROM restaurants r LEFT JOIN price_groups g ON g.id = r.price_group_id
     WHERE r.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function listRestaurants() {
  const { rows } = await pool.query(
    `SELECT r.id, r.name, r.phone, r.address, r.status, r.price_group_id, r.created_at,
            g.name AS price_group_name,
            (SELECT COUNT(*)::int FROM wholesale_orders o WHERE o.restaurant_id = r.id) AS orders_count
     FROM restaurants r LEFT JOIN price_groups g ON g.id = r.price_group_id
     ORDER BY r.id ASC`
  );
  return rows;
}

// Удаление ресторана: его цены, скрытые товары и аккаунт удаляются, а оптовые
// заказы остаются в истории (restaurant_id становится NULL, название и
// контакты хранятся в самом заказе).
// Пароль, который ресторан задал при регистрации (или администратор позже).
// null — если он не сохранён (аккаунты, созданные до этой функции).
function getRestaurantPassword(r) {
  return r && r.password_enc ? decryptSecret(r.password_enc) : null;
}

async function deleteRestaurant(id) {
  await pool.query("DELETE FROM restaurants WHERE id = $1", [id]);
}

async function updateRestaurant(id, { name, phone, address, status, priceGroupId, newPassword }) {
  const sets = [];
  const vals = [];
  const push = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };

  if (name !== undefined) push("name", name);
  if (phone !== undefined) push("phone", phone);
  if (address !== undefined) push("address", address);
  if (status !== undefined) push("status", status);
  if (priceGroupId !== undefined) push("price_group_id", priceGroupId);
  if (newPassword) {
    push("password_hash", bcrypt.hashSync(newPassword, 12));
    push("password_enc", encryptSecret(newPassword));
  }
  if (!sets.length) return getRestaurantById(id);

  vals.push(id);
  try {
    await pool.query(`UPDATE restaurants SET ${sets.join(", ")}, updated_at = now() WHERE id = $${vals.length}`, vals);
  } catch (err) {
    if (err.code === "23505") {
      const e = new Error("Ресторан с таким названием уже есть.");
      e.statusCode = 400;
      throw e;
    }
    throw err;
  }
  return getRestaurantById(id);
}

/* ----------------------------------------------------------
   Группы цен
   ---------------------------------------------------------- */
async function listPriceGroups() {
  const { rows } = await pool.query(
    `SELECT g.id, g.name,
            (SELECT COUNT(*)::int FROM restaurants r WHERE r.price_group_id = g.id) AS restaurants_count
     FROM price_groups g ORDER BY g.id`
  );
  return rows;
}

async function createPriceGroup(name) {
  try {
    const { rows } = await pool.query("INSERT INTO price_groups (name) VALUES ($1) RETURNING id, name", [name]);
    return rows[0];
  } catch (err) {
    if (err.code === "23505") {
      const e = new Error("Группа с таким названием уже есть.");
      e.statusCode = 400;
      throw e;
    }
    throw err;
  }
}

async function renamePriceGroup(id, name) {
  try {
    const { rows } = await pool.query("UPDATE price_groups SET name = $1 WHERE id = $2 RETURNING id, name", [name, id]);
    return rows[0] || null;
  } catch (err) {
    if (err.code === "23505") {
      const e = new Error("Группа с таким названием уже есть.");
      e.statusCode = 400;
      throw e;
    }
    throw err;
  }
}

async function deletePriceGroup(id) {
  await pool.query("DELETE FROM price_groups WHERE id = $1", [id]);
}

async function priceGroupExists(id) {
  const { rows } = await pool.query("SELECT 1 FROM price_groups WHERE id = $1", [id]);
  return rows.length > 0;
}

/* ----------------------------------------------------------
   Цены
   ---------------------------------------------------------- */
function baseBlockPrice(p) {
  return round2(Number(p.wholesale_price) * Number(p.wholesale_min_qty || 1));
}

// Таблица цен для администратора: по каждому оптовому товару — базовая,
// групповая, индивидуальная и итоговая цена ресторана.
async function getRestaurantPriceTable(restaurant) {
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.weight, p.category, p.image_path, p.wholesale_price, p.wholesale_min_qty,
            gp.price AS group_price, rp.price AS own_price,
            (hp.product_id IS NOT NULL) AS hidden
     FROM products p
     LEFT JOIN price_group_prices gp ON gp.product_id = p.id AND gp.group_id = $2
     LEFT JOIN restaurant_prices rp ON rp.product_id = p.id AND rp.restaurant_id = $1
     LEFT JOIN restaurant_hidden_products hp ON hp.product_id = p.id AND hp.restaurant_id = $1
     WHERE p.available_wholesale = true AND p.wholesale_price IS NOT NULL
     ORDER BY p.name`,
    [restaurant.id, restaurant.price_group_id]
  );
  return rows.map((p) => {
    const base = baseBlockPrice(p);
    const group = p.group_price === null ? null : round2(p.group_price);
    const own = p.own_price === null ? null : round2(p.own_price);
    return {
      hidden: p.hidden,
      productId: p.id,
      category: p.category,
      image: p.image_path,
      name: p.name,
      weight: p.weight,
      unitsPerBlock: p.wholesale_min_qty,
      basePrice: base,
      groupPrice: group,
      ownPrice: own,
      finalPrice: own !== null ? own : group !== null ? group : base,
    };
  });
}

async function getGroupPriceTable(groupId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.weight, p.wholesale_price, p.wholesale_min_qty, gp.price AS group_price
     FROM products p
     LEFT JOIN price_group_prices gp ON gp.product_id = p.id AND gp.group_id = $1
     WHERE p.available_wholesale = true AND p.wholesale_price IS NOT NULL
     ORDER BY p.name`,
    [groupId]
  );
  return rows.map((p) => ({
    productId: p.id,
    name: p.name,
    weight: p.weight,
    unitsPerBlock: p.wholesale_min_qty,
    basePrice: baseBlockPrice(p),
    groupPrice: p.group_price === null ? null : round2(p.group_price),
  }));
}

async function setRestaurantPrice(restaurantId, productId, price) {
  await pool.query(
    `INSERT INTO restaurant_prices (restaurant_id, product_id, price) VALUES ($1,$2,$3)
     ON CONFLICT (restaurant_id, product_id) DO UPDATE SET price = EXCLUDED.price`,
    [restaurantId, productId, price]
  );
}
async function deleteRestaurantPrice(restaurantId, productId) {
  await pool.query("DELETE FROM restaurant_prices WHERE restaurant_id = $1 AND product_id = $2", [restaurantId, productId]);
}
async function setProductHidden(restaurantId, productId, hidden) {
  if (hidden) {
    await pool.query(
      "INSERT INTO restaurant_hidden_products (restaurant_id, product_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [restaurantId, productId]
    );
  } else {
    await pool.query("DELETE FROM restaurant_hidden_products WHERE restaurant_id = $1 AND product_id = $2", [restaurantId, productId]);
  }
}
async function setGroupPrice(groupId, productId, price) {
  await pool.query(
    `INSERT INTO price_group_prices (group_id, product_id, price) VALUES ($1,$2,$3)
     ON CONFLICT (group_id, product_id) DO UPDATE SET price = EXCLUDED.price`,
    [groupId, productId, price]
  );
}
async function deleteGroupPrice(groupId, productId) {
  await pool.query("DELETE FROM price_group_prices WHERE group_id = $1 AND product_id = $2", [groupId, productId]);
}

// Каталог ресторана: ТОЛЬКО его итоговые цены. Чужие цены, группы и
// индивидуальные цены других ресторанов в запрос не попадают вообще.
async function getCatalogForRestaurant(restaurant) {
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.category, p.weight, p.description, p.image_path,
            p.wholesale_price, p.wholesale_min_qty,
            gp.price AS group_price, rp.price AS own_price
     FROM products p
     LEFT JOIN price_group_prices gp ON gp.product_id = p.id AND gp.group_id = $2
     LEFT JOIN restaurant_prices rp ON rp.product_id = p.id AND rp.restaurant_id = $1
     WHERE p.available_wholesale = true AND p.wholesale_price IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM restaurant_hidden_products h WHERE h.restaurant_id = $1 AND h.product_id = p.id)
     ORDER BY p.created_at DESC`,
    [restaurant.id, restaurant.price_group_id]
  );
  return rows.map((p) => {
    const base = baseBlockPrice(p);
    const price = p.own_price !== null ? round2(p.own_price) : p.group_price !== null ? round2(p.group_price) : base;
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      weight: p.weight,
      description: p.description,
      image: p.image_path,
      unitsPerBlock: p.wholesale_min_qty,
      pricePerBlock: price,
    };
  });
}

/* ----------------------------------------------------------
   Оптовые заказы
   ---------------------------------------------------------- */
async function createWholesaleOrder(restaurant, items, comment) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const ids = items.map((i) => i.productId);
    const { rows } = await client.query(
      `SELECT p.id, p.name, p.wholesale_price, p.wholesale_min_qty, p.available_wholesale,
              gp.price AS group_price, rp.price AS own_price,
              (hp.product_id IS NOT NULL) AS hidden
       FROM products p
       LEFT JOIN price_group_prices gp ON gp.product_id = p.id AND gp.group_id = $3
       LEFT JOIN restaurant_prices rp ON rp.product_id = p.id AND rp.restaurant_id = $2
       LEFT JOIN restaurant_hidden_products hp ON hp.product_id = p.id AND hp.restaurant_id = $2
       WHERE p.id = ANY($1::int[])`,
      [ids, restaurant.id, restaurant.price_group_id]
    );
    const byId = new Map(rows.map((r) => [r.id, r]));

    const resolved = [];
    for (const it of items) {
      const p = byId.get(it.productId);
      if (!p || !p.available_wholesale || p.wholesale_price === null || p.hidden) {
        const err = new Error("Один из товаров недоступен для оптового заказа. Обновите страницу.");
        err.statusCode = 400;
        throw err;
      }
      const base = baseBlockPrice(p);
      const price = p.own_price !== null ? round2(p.own_price) : p.group_price !== null ? round2(p.group_price) : base;
      resolved.push({
        product_id: p.id,
        product_name: p.name,
        units_per_block: p.wholesale_min_qty,
        price_per_block: price,
        ordered_blocks: it.blocks,
      });
    }

    // Наличие на складе НЕ проверяем намеренно: сотрудник сам уточнит
    // фактическое количество и зафиксирует "подтверждено".
    const orderRes = await client.query(
      `INSERT INTO wholesale_orders
         (restaurant_id, restaurant_name, restaurant_phone, restaurant_address, customer_comment)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [restaurant.id, restaurant.name, restaurant.phone, restaurant.address, comment || null]
    );
    const order = orderRes.rows[0];

    for (const r of resolved) {
      await client.query(
        `INSERT INTO wholesale_order_items
           (order_id, product_id, product_name, units_per_block, price_per_block, ordered_blocks)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [order.id, r.product_id, r.product_name, r.units_per_block, r.price_per_block, r.ordered_blocks]
      );
    }

    await client.query("COMMIT");
    return getWholesaleOrder(order.id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function buildOrderView(order, itemRows) {
  const items = itemRows.map((it) => {
    const ppb = round2(it.price_per_block);
    const confirmed = it.confirmed_blocks;
    return {
      id: it.id,
      productId: it.product_id,
      productName: it.product_name,
      unitsPerBlock: it.units_per_block,
      pricePerBlock: ppb,
      orderedBlocks: it.ordered_blocks,
      orderedUnits: it.ordered_blocks * it.units_per_block,
      orderedSubtotal: round2(ppb * it.ordered_blocks),
      confirmedBlocks: confirmed,
      confirmedUnits: confirmed === null ? null : confirmed * it.units_per_block,
      confirmedSubtotal: confirmed === null ? null : round2(ppb * confirmed),
    };
  });

  const hasConfirmed = items.some((i) => i.confirmedBlocks !== null);
  const totals = {
    orderedBlocks: items.reduce((s, i) => s + i.orderedBlocks, 0),
    orderedUnits: items.reduce((s, i) => s + i.orderedUnits, 0),
    orderedTotal: round2(items.reduce((s, i) => s + i.orderedSubtotal, 0)),
    hasConfirmed,
    confirmedBlocks: items.reduce((s, i) => s + (i.confirmedBlocks === null ? 0 : i.confirmedBlocks), 0),
    confirmedUnits: items.reduce((s, i) => s + (i.confirmedUnits === null ? 0 : i.confirmedUnits), 0),
    confirmedTotal: round2(items.reduce((s, i) => s + (i.confirmedSubtotal === null ? 0 : i.confirmedSubtotal), 0)),
  };

  return {
    id: order.id,
    number: orderNumber(order.id),
    restaurantId: order.restaurant_id,
    restaurantName: order.restaurant_name,
    restaurantPhone: order.restaurant_phone,
    restaurantAddress: order.restaurant_address,
    status: order.status,
    customerComment: order.customer_comment,
    adminComment: order.admin_comment,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items,
    totals,
  };
}

async function getWholesaleOrder(id, restaurantId) {
  const params = [id];
  let where = "id = $1";
  if (restaurantId !== undefined) {
    params.push(restaurantId);
    where += " AND restaurant_id = $2";
  }
  const { rows } = await pool.query(`SELECT * FROM wholesale_orders WHERE ${where}`, params);
  if (!rows[0]) return null;
  const items = await pool.query("SELECT * FROM wholesale_order_items WHERE order_id = $1 ORDER BY id", [id]);
  return buildOrderView(rows[0], items.rows);
}

async function listWholesaleOrders({ restaurantId, status } = {}) {
  const params = [];
  const conds = [];
  if (restaurantId !== undefined) { params.push(restaurantId); conds.push(`restaurant_id = $${params.length}`); }
  if (status) { params.push(status); conds.push(`status = $${params.length}`); }
  const { rows: orders } = await pool.query(
    `SELECT * FROM wholesale_orders ${conds.length ? "WHERE " + conds.join(" AND ") : ""} ORDER BY id DESC`,
    params
  );
  if (!orders.length) return [];
  const { rows: items } = await pool.query(
    "SELECT * FROM wholesale_order_items WHERE order_id = ANY($1::int[]) ORDER BY id",
    [orders.map((o) => o.id)]
  );
  const grouped = new Map();
  items.forEach((it) => {
    if (!grouped.has(it.order_id)) grouped.set(it.order_id, []);
    grouped.get(it.order_id).push(it);
  });
  return orders.map((o) => buildOrderView(o, grouped.get(o.id) || []));
}

// Администратор: смена статуса, комментарий и подтверждённые количества.
// ordered_blocks никогда не перезаписывается — история "заказано" сохраняется.
async function updateWholesaleOrderAdmin(id, { status, adminComment, confirmedItems }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT id FROM wholesale_orders WHERE id = $1 FOR UPDATE", [id]);
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    if (Array.isArray(confirmedItems)) {
      for (const ci of confirmedItems) {
        await client.query(
          "UPDATE wholesale_order_items SET confirmed_blocks = $1 WHERE id = $2 AND order_id = $3",
          [ci.confirmedBlocks, ci.id, id]
        );
      }
    }

    const sets = ["updated_at = now()"];
    const vals = [];
    if (status !== undefined) { vals.push(status); sets.push(`status = $${vals.length}`); }
    if (adminComment !== undefined) { vals.push(adminComment || null); sets.push(`admin_comment = $${vals.length}`); }
    vals.push(id);
    await client.query(`UPDATE wholesale_orders SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);

    await client.query("COMMIT");
    return getWholesaleOrder(id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  RESTAURANT_STATUSES,
  WHOLESALE_ORDER_STATUSES,
  MAX_BLOCKS_PER_ITEM,
  MAX_ITEMS_PER_ORDER,
  initPartnerSchema,
  registerRestaurant,
  getRestaurantByName,
  getRestaurantById,
  listRestaurants,
  updateRestaurant,
  deleteRestaurant,
  getRestaurantPassword,
  listPriceGroups,
  createPriceGroup,
  renamePriceGroup,
  deletePriceGroup,
  priceGroupExists,
  getRestaurantPriceTable,
  getGroupPriceTable,
  setRestaurantPrice,
  deleteRestaurantPrice,
  setGroupPrice,
  deleteGroupPrice,
  setProductHidden,
  getCatalogForRestaurant,
  createWholesaleOrder,
  getWholesaleOrder,
  listWholesaleOrders,
  updateWholesaleOrderAdmin,
};
