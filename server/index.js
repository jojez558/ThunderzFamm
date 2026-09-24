require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const session = require("express-session");

const publicRoutes = require("./routes/public");
const bookingRoutes = require("./routes/bookings");
const { router: checkoutRoutes, webhookHandler } = require("./routes/paystack");
const adminRoutes = require("./routes/admin");
const { init: initDatabase } = require("./db");

const app = express();
const PORT = process.env.PORT || 4000;

app.set("trust proxy", 1);

app.use(
  cors({
    origin: process.env.CLIENT_URL || true,
    credentials: true,
  }),
);

// Paystack webhook needs the RAW request body to verify its signature, so it
// must be registered before the global express.json() body parser below.
app.post(
  "/api/checkout/webhook",
  express.raw({ type: "application/json" }),
  webhookHandler,
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.disable("x-powered-by");

app.use(
  session({
    name: "mt.sid",
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
  }),
);

// ---- API routes ----
app.use("/api", publicRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/admin", adminRoutes);

// ---- static frontend ----
const PUBLIC_DIR = path.join(__dirname, "..", "public");
app.use(express.static(PUBLIC_DIR));

app.get("/admin", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "admin.html"));
});

app.get("/admin/", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "admin.html"));
});

app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.includes(".")) {
    return res.status(404).sendFile(path.join(PUBLIC_DIR, "404.html"));
  }
  next();
});

// Fallback to index.html for any non-API GET request (simple SPA-style routing)
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

async function start() {
  await initDatabase();
app.listen(PORT, () => {
  console.log(`Thunderz Family server running on http://localhost:${PORT}`);
  console.log(`Admin panel:  http://localhost:${PORT}/admin`);
  if (
    !process.env.PAYSTACK_SECRET_KEY ||
    process.env.PAYSTACK_SECRET_KEY.includes("replace_me")
  ) {
    console.log(
      "⚠️  Paystack is not configured yet — checkout will return an error until you add PAYSTACK_SECRET_KEY to .env",
    );
  }
  if (!process.env.SMTP_HOST) {
    console.log(
      "⚠️  SMTP is not configured yet — booking notifications will just log to this console.",
    );
  }
});
}

start().catch((err) => {
  console.error("Database startup failed:", err.message);
  process.exitCode = 1;
});
