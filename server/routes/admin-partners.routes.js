const express = require("express");
const partners = require("../partners");
const requireAuth = require("../middleware/requireAuth");

/* Админские маршруты оптового портала: рестораны, группы цен,
   индивидуальные цены и оптовые заказы. Всё под requireAuth
   (сессия администратора, cookie rf_session) — токен ресторана сюда
   не подходит, он подписан другим ключом. */

const restaurantsRouter = express.Router();
const groupsRouter = express.Router();
const ordersRouter = express.Router();
[restaurantsRouter, groupsRouter, ordersRouter].forEach((r) => r.use(requireAuth));

function parseId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parsePrice(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 10000000) return null;
  return Math.round(n * 100) / 100;
}

function serializeRestaurant(r) {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    address: r.address,
    status: r.status,
    priceGroupId: r.price_group_id,
    priceGroupName: r.price_group_name || null,
    ordersCount: r.orders_count,
    createdAt: r.created_at,
  };
}

/* ---------------- Рестораны ---------------- */

restaurantsRouter.get("/", async (req, res, next) => {
  try {
    const rows = await partners.listRestaurants();
    res.json(rows.map(serializeRestaurant));
  } catch (err) {
    next(err);
  }
});

restaurantsRouter.get("/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const r = id && (await partners.getRestaurantById(id));
    if (!r) return res.status(404).json({ error: "Ресторан не найден." });
    const prices = await partners.getRestaurantPriceTable(r);
    res.json({ ...serializeRestaurant(r), prices });
  } catch (err) {
    next(err);
  }
});

restaurantsRouter.patch("/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const existing = id && (await partners.getRestaurantById(id));
    if (!existing) return res.status(404).json({ error: "Ресторан не найден." });

    const b = req.body || {};
    const changes = {};
    const errors = [];

    if (b.name !== undefined) {
      const v = String(b.name).trim();
      if (v.length < 2 || v.length > 100) errors.push("Название должно быть от 2 до 100 символов.");
      changes.name = v;
    }
    if (b.phone !== undefined) {
      const v = String(b.phone).trim();
      if (!v || v.length > 40) errors.push("Укажите телефон (до 40 символов).");
      changes.phone = v;
    }
    if (b.address !== undefined) {
      const v = String(b.address).trim();
      if (!v || v.length > 300) errors.push("Укажите адрес (до 300 символов).");
      changes.address = v;
    }
    if (b.status !== undefined) {
      if (!partners.RESTAURANT_STATUSES.includes(b.status)) errors.push("Недопустимый статус.");
      changes.status = b.status;
    }
    if (b.priceGroupId !== undefined) {
      if (b.priceGroupId === null || b.priceGroupId === "") {
        changes.priceGroupId = null;
      } else {
        const gid = parseId(b.priceGroupId);
        if (!gid || !(await partners.priceGroupExists(gid))) errors.push("Группа цен не найдена.");
        changes.priceGroupId = gid;
      }
    }
    if (b.newPassword) {
      if (String(b.newPassword).length < 8) errors.push("Новый пароль — не короче 8 символов.");
      changes.newPassword = String(b.newPassword);
    }
    if (errors.length) return res.status(400).json({ error: errors.join(" ") });

    const updated = await partners.updateRestaurant(id, changes);
    res.json(serializeRestaurant(updated));
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// Индивидуальная цена (за блок) конкретному ресторану
restaurantsRouter.put("/:id/prices/:productId", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const productId = parseId(req.params.productId);
    const price = parsePrice(req.body && req.body.price);
    if (!id || !productId || price === null) return res.status(400).json({ error: "Укажите корректную цену." });
    if (!(await partners.getRestaurantById(id))) return res.status(404).json({ error: "Ресторан не найден." });
    await partners.setRestaurantPrice(id, productId, price);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === "23503") return res.status(400).json({ error: "Товар не найден." });
    next(err);
  }
});

restaurantsRouter.delete("/:id/prices/:productId", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const productId = parseId(req.params.productId);
    if (!id || !productId) return res.status(400).json({ error: "Некорректный запрос." });
    await partners.deleteRestaurantPrice(id, productId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ---------------- Группы цен ---------------- */

groupsRouter.get("/", async (req, res, next) => {
  try {
    const rows = await partners.listPriceGroups();
    res.json(rows.map((g) => ({ id: g.id, name: g.name, restaurantsCount: g.restaurants_count })));
  } catch (err) {
    next(err);
  }
});

groupsRouter.post("/", async (req, res, next) => {
  try {
    const name = String((req.body && req.body.name) || "").trim();
    if (!name || name.length > 40) return res.status(400).json({ error: "Название группы — от 1 до 40 символов." });
    res.status(201).json(await partners.createPriceGroup(name));
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

groupsRouter.patch("/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const name = String((req.body && req.body.name) || "").trim();
    if (!id || !name || name.length > 40) return res.status(400).json({ error: "Название группы — от 1 до 40 символов." });
    const g = await partners.renamePriceGroup(id, name);
    if (!g) return res.status(404).json({ error: "Группа не найдена." });
    res.json(g);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// Удаление группы: рестораны этой группы остаются без группы (цены падают
// на базовые), цены группы удаляются вместе с ней.
groupsRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Некорректный запрос." });
    await partners.deletePriceGroup(id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

groupsRouter.get("/:id/prices", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id || !(await partners.priceGroupExists(id))) return res.status(404).json({ error: "Группа не найдена." });
    res.json(await partners.getGroupPriceTable(id));
  } catch (err) {
    next(err);
  }
});

groupsRouter.put("/:id/prices/:productId", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const productId = parseId(req.params.productId);
    const price = parsePrice(req.body && req.body.price);
    if (!id || !productId || price === null) return res.status(400).json({ error: "Укажите корректную цену." });
    if (!(await partners.priceGroupExists(id))) return res.status(404).json({ error: "Группа не найдена." });
    await partners.setGroupPrice(id, productId, price);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === "23503") return res.status(400).json({ error: "Товар не найден." });
    next(err);
  }
});

groupsRouter.delete("/:id/prices/:productId", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const productId = parseId(req.params.productId);
    if (!id || !productId) return res.status(400).json({ error: "Некорректный запрос." });
    await partners.deleteGroupPrice(id, productId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ---------------- Оптовые заказы ---------------- */

ordersRouter.get("/", async (req, res, next) => {
  try {
    const status = req.query.status;
    if (status && !partners.WHOLESALE_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Недопустимый статус." });
    }
    res.json(await partners.listWholesaleOrders({ status: status || undefined }));
  } catch (err) {
    next(err);
  }
});

ordersRouter.get("/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const order = id && (await partners.getWholesaleOrder(id));
    if (!order) return res.status(404).json({ error: "Заказ не найден." });
    res.json(order);
  } catch (err) {
    next(err);
  }
});

// Статус, комментарий администратора и подтверждённые блоки по позициям.
// Заказанное количество здесь не меняется — только "подтверждено".
ordersRouter.patch("/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: "Заказ не найден." });
    const b = req.body || {};
    const changes = {};

    if (b.status !== undefined) {
      if (!partners.WHOLESALE_ORDER_STATUSES.includes(b.status)) {
        return res.status(400).json({ error: "Недопустимый статус." });
      }
      changes.status = b.status;
    }
    if (b.adminComment !== undefined) {
      const c = String(b.adminComment || "").trim();
      if (c.length > 1000) return res.status(400).json({ error: "Комментарий слишком длинный." });
      changes.adminComment = c;
    }
    if (b.items !== undefined) {
      if (!Array.isArray(b.items)) return res.status(400).json({ error: "Некорректные позиции." });
      changes.confirmedItems = [];
      for (const it of b.items) {
        const itemId = parseId(it && it.id);
        const blocks = Number(it && it.confirmedBlocks);
        if (!itemId || !Number.isInteger(blocks) || blocks < 0 || blocks > partners.MAX_BLOCKS_PER_ITEM) {
          return res.status(400).json({ error: "Подтверждённое количество — целое число блоков от 0." });
        }
        changes.confirmedItems.push({ id: itemId, confirmedBlocks: blocks });
      }
    }

    const order = await partners.updateWholesaleOrderAdmin(id, changes);
    if (!order) return res.status(404).json({ error: "Заказ не найден." });
    res.json(order);
  } catch (err) {
    next(err);
  }
});

module.exports = { restaurantsRouter, groupsRouter, ordersRouter };
