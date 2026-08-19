const express = require("express");
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();
router.use(requireAuth);

function serializeOrderSummary(order) {
  return {
    id: order.id,
    orderType: order.order_type,
    companyName: order.company_name,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    customerAddress: order.customer_address,
    comment: order.comment,
    totalAmount: order.total_amount,
    status: order.status,
    itemsCount: order.items_count,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}

function serializeOrderDetail(order) {
  return {
    ...serializeOrderSummary(order),
    items: (order.items || []).map((it) => ({
      productId: it.product_id,
      productName: it.product_name,
      unitPrice: it.unit_price,
      quantity: it.quantity,
      subtotal: it.subtotal,
    })),
  };
}

/* GET /api/admin/orders — список всех заказов, новые сверху */
router.get("/", async (req, res, next) => {
  try {
    const rows = await db.getAllOrders();
    res.json(rows.map(serializeOrderSummary));
  } catch (err) {
    next(err);
  }
});

/* GET /api/admin/orders/:id — детали одного заказа с позициями */
router.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const order = await db.getOrderById(id);
    if (!order) return res.status(404).json({ error: "Заказ не найден." });
    res.json(serializeOrderDetail(order));
  } catch (err) {
    next(err);
  }
});

/* PATCH /api/admin/orders/:id/status — смена статуса заказа */
router.patch("/:id/status", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const status = String((req.body && req.body.status) || "").trim();

    if (!db.ORDER_STATUSES.includes(status)) {
      return res.status(400).json({
        error: "Недопустимый статус. Разрешены: " + db.ORDER_STATUSES.join(", "),
      });
    }

    const existing = await db.getOrderById(id);
    if (!existing) return res.status(404).json({ error: "Заказ не найден." });

    const updated = await db.updateOrderStatus(id, status);
    res.json(serializeOrderSummary(updated));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
