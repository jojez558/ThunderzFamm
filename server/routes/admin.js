const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const { load, mutate, newId, storeMedia } = require("../db");
const adminAuth = require("../middleware/adminAuth");
const rateLimit = require("../middleware/rateLimit");

const router = express.Router();
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("image/")) return cb(null, true);
    cb(new Error("Only image files are allowed."));
  },
});

const pageImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("image/")) return cb(null, true);
    cb(new Error("Only image files are allowed."));
  },
});
const pageImageKeys = new Set([
  "home",
  "about",
  "crew",
  "merch",
  "events",
  "contact",
  "privacy",
  "terms",
  "404",
]);

/* ---------------- auth ---------------- */

router.post(
  "/login",
  rateLimit({
    windowMs: 15 * 60_000,
    max: 8,
    message: "Too many login attempts. Please try again later.",
  }),
  async (req, res) => {
    const { password } = req.body || {};
    const data = await load();
    if (!password || !bcrypt.compareSync(password, data.admin.passwordHash)) {
      return res.status(401).json({ error: "Incorrect password." });
    }
    req.session.isAdmin = true;
    res.json({ ok: true });
  },
);

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get("/session", (req, res) => {
  res.json({ loggedIn: !!(req.session && req.session.isAdmin) });
});

router.post("/upload-image", adminAuth, upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image file was uploaded." });
  }
  const imageUrl = await storeMedia(req.file);
  res.json({ ok: true, url: imageUrl });
});

router.get("/page-images", adminAuth, async (_req, res) => {
  const data = await load();
  res.json(data.pageImages || {});
});

router.post("/page-images/:pageKey", adminAuth, pageImageUpload.single("image"), async (req, res) => {
  if (!pageImageKeys.has(req.params.pageKey)) {
    return res.status(400).json({ error: "Unknown page image slot." });
  }
  if (!req.file) return res.status(400).json({ error: "No image file was uploaded." });
  const image = await storeMedia(req.file);
  await mutate((data) => {
    data.pageImages = data.pageImages || {};
    data.pageImages[req.params.pageKey] = image;
  });
  res.json({ ok: true, pageKey: req.params.pageKey });
});

router.delete("/page-images/:pageKey", adminAuth, async (req, res) => {
  if (!pageImageKeys.has(req.params.pageKey)) {
    return res.status(400).json({ error: "Unknown page image slot." });
  }
  await mutate((data) => {
    if (data.pageImages) delete data.pageImages[req.params.pageKey];
  });
  res.json({ ok: true });
});

router.post("/change-password", adminAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const data = await load();
  if (
    !currentPassword ||
    !bcrypt.compareSync(currentPassword, data.admin.passwordHash)
  ) {
    return res.status(401).json({ error: "Current password is incorrect." });
  }
  if (!newPassword || newPassword.length < 8) {
    return res
      .status(400)
      .json({ error: "New password must be at least 8 characters." });
  }
  await mutate((d) => {
    d.admin.passwordHash = bcrypt.hashSync(newPassword, 10);
  });
  res.json({ ok: true });
});

/* everything below requires an admin session */
router.use(adminAuth);

/* ---------------- generic CRUD helper ---------------- */
// Builds GET/POST/PUT/DELETE handlers for a flat list stored at data[key].
function crud(key, { idPrefix, allowedFields }) {
  const sub = express.Router();

  sub.get("/", async (req, res) => {
    const data = await load();
    res.json(data[key] || []);
  });

  sub.post("/", async (req, res) => {
    const item = { id: newId(idPrefix) };
    for (const f of allowedFields) item[f] = req.body[f];
    await mutate((data) => {
      data[key].push(item);
    });
    res.status(201).json(item);
  });

  sub.put("/:id", async (req, res) => {
    let updated = null;
    await mutate((data) => {
      const idx = data[key].findIndex((x) => x.id === req.params.id);
      if (idx === -1) return;
      for (const f of allowedFields) {
        if (req.body[f] !== undefined) data[key][idx][f] = req.body[f];
      }
      updated = data[key][idx];
    });
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  sub.delete("/:id", async (req, res) => {
    let existed = false;
    await mutate((data) => {
      const before = data[key].length;
      data[key] = data[key].filter((x) => x.id !== req.params.id);
      existed = data[key].length < before;
    });
    if (!existed) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  });

  return sub;
}

router.use(
  "/products",
  crud("products", {
    idPrefix: "prod",
    allowedFields: [
      "name",
      "price",
      "sizes",
      "description",
      "color",
      "stock",
      "image",
    ],
  }),
);
router.use(
  "/crew",
  crud("crew", {
    idPrefix: "crew",
    allowedFields: ["name", "role", "color", "image"],
  }),
);
router.use(
  "/shows",
  crud("shows", {
    idPrefix: "show",
    allowedFields: ["date", "name", "venue", "description"],
  }),
);
router.use(
  "/videos",
  crud("videos", {
    idPrefix: "video",
    allowedFields: ["title", "url", "description"],
  }),
);

/* ---------------- bookings (read + status update, no delete-by-default) ---------------- */

router.get("/bookings", async (req, res) => {
  const data = await load();
  res.json(data.bookings);
});

router.put("/bookings/:id", async (req, res) => {
  const { status } = req.body || {};
  const allowed = ["new", "contacted", "booked", "closed"];
  if (!allowed.includes(status)) {
    return res
      .status(400)
      .json({ error: `status must be one of: ${allowed.join(", ")}` });
  }
  let updated = null;
  await mutate((data) => {
    const b = data.bookings.find((x) => x.id === req.params.id);
    if (b) {
      b.status = status;
      updated = b;
    }
  });
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

router.delete("/bookings/:id", async (req, res) => {
  let existed = false;
  await mutate((data) => {
    const before = data.bookings.length;
    data.bookings = data.bookings.filter((x) => x.id !== req.params.id);
    existed = data.bookings.length < before;
  });
  if (!existed) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

/* ---------------- orders (read only — created by Paystack webhook) ---------------- */

router.get("/orders", async (req, res) => {
  const data = await load();
  res.json(data.orders);
});

module.exports = router;
