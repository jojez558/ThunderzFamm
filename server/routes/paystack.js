const crypto = require("crypto");
const express = require("express");
const { load, mutate, newId } = require("../db");
const { email } = require("../validation");
const { sendMail } = require("../mailer");

const router = express.Router();

function getSecret() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  return key && !key.includes("replace_me") ? key : null;
}

async function paystackRequest(path, options = {}) {
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getSecret()}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.status)
    throw new Error(body.message || "Paystack request failed.");
  return body.data;
}

async function normalizeItems(items) {
  const products = (await load()).products;
  const normalizedItems = [];
  let amount = 0;
  for (const item of items) {
    const product = products.find((p) => p.id === item.productId);
    if (!product) throw new Error(`Unknown product: ${item.productId}`);
    const qty = Math.max(1, Math.min(50, Number(item.qty) || 1));
    const size =
      item.size && product.sizes.includes(item.size)
        ? item.size
        : product.sizes[0];
    const stock =
      product.stock && Number.isInteger(product.stock[size])
        ? product.stock[size]
        : 0;
    if (qty > stock)
      throw new Error(
        `${product.name} in size ${size} has only ${stock} left.`,
      );
    normalizedItems.push({ productId: product.id, size, qty });
    amount += product.price * qty;
  }
  return { normalizedItems, amount };
}

router.post("/create-session", async (req, res) => {
  if (!getSecret())
    return res
      .status(500)
      .json({
        error:
          "Paystack is not configured yet. Add PAYSTACK_SECRET_KEY to your .env file.",
      });
  const { items, customerEmail } = req.body || {};
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: "Your cart is empty." });
  let buyerEmail;
  let cart;
  try {
    buyerEmail = email(customerEmail);
    cart = await normalizeItems(items);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  try {
    const clientUrl = process.env.CLIENT_URL || "http://localhost:4000";
    const transaction = await paystackRequest("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: buyerEmail,
        amount: cart.amount * 100,
        currency: "KES",
        callback_url: `${clientUrl}/?checkout=success`,
        metadata: {
          crew: "Thunderz Family",
          cart: JSON.stringify(cart.normalizedItems),
        },
      }),
    });
    res.json({ url: transaction.authorization_url, id: transaction.reference });
  } catch (err) {
    console.error("Paystack checkout error:", err.message);
    res
      .status(500)
      .json({ error: "Could not start checkout. Please try again shortly." });
  }
});

router.get("/session/:reference", async (req, res) => {
  if (!getSecret())
    return res.status(500).json({ error: "Paystack is not configured." });
  try {
    const transaction = await paystackRequest(
      `/transaction/verify/${encodeURIComponent(req.params.reference)}`,
    );
    res.json({
      paid: transaction.status === "success",
      amount_total: transaction.amount,
      customer_email: transaction.customer && transaction.customer.email,
    });
  } catch (err) {
    res.status(404).json({ error: "Transaction not found." });
  }
});

async function recordPaidOrder(transaction) {
  const metadata = transaction.metadata || {};
  let items;
  try {
    items = JSON.parse(metadata.cart || "[]");
  } catch (err) {
    return;
  }
  let order;
  await mutate((data) => {
    if (
      data.orders.some(
        (item) => item.paystackReference === transaction.reference,
      )
    )
      return;
    for (const item of items) {
      const product = data.products.find((p) => p.id === item.productId);
      if (product && product.stock && product.stock[item.size] !== undefined)
        product.stock[item.size] = Math.max(
          0,
          product.stock[item.size] - item.qty,
        );
    }
    order = {
      id: newId("ord"),
      paystackReference: transaction.reference,
      email: transaction.customer && transaction.customer.email,
      amountTotal: transaction.amount,
      items,
      status: "paid",
      createdAt: new Date().toISOString(),
    };
    data.orders.unshift(order);
  });
  if (order && order.email) {
    try {
      await sendMail({
        to: order.email,
        subject: "Thunderz Family order confirmation",
        text: `Thanks for your Thunderz Family order.\n\nOrder: ${order.id}\nTotal: KES ${(order.amountTotal / 100).toLocaleString("en-KE")}\n\nWe will send another update when your order ships.`,
      });
    } catch (err) {
      console.error("Customer order email failed:", err.message);
    }
  }
}

async function webhookHandler(req, res) {
  const secret = getSecret();
  const signature = req.headers["x-paystack-signature"];
  if (!secret || !signature)
    return res.status(400).send("Webhook not configured");
  const expected = crypto
    .createHmac("sha512", secret)
    .update(req.body)
    .digest("hex");
  if (signature !== expected)
    return res.status(401).send("Invalid webhook signature");
  let event;
  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch (err) {
    return res.status(400).send("Invalid webhook payload");
  }
  if (event.event === "charge.success" && event.data.status === "success")
    await recordPaidOrder(event.data);
  res.json({ received: true });
}

module.exports = { router, webhookHandler };
