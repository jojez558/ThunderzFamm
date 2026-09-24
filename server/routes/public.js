const express = require("express");
const { load, openMedia } = require("../db");

const router = express.Router();

router.get("/products", async (req, res) => {
  const data = await load();
  res.json(
    data.products.map((product) => ({
      ...product,
      stock: product.stock || {},
    })),
  );
});

router.get("/crew", async (req, res) => {
  const data = await load();
  res.json(data.crew);
});

router.get("/shows", async (req, res) => {
  const data = await load();
  const shows = data
    .shows.slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  res.json(shows);
});

router.get("/videos", async (req, res) => {
  const data = await load();
  res.json(data.videos || []);
});

router.get("/page-images", async (_req, res) => {
  const data = await load();
  res.json(data.pageImages || {});
});

router.get("/media/:id", async (req, res) => {
  const media = await openMedia(req.params.id);
  if (!media) return res.status(404).send("Image not found.");
  res.set("Content-Type", media.file.contentType || "application/octet-stream");
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  media.stream.pipe(res);
});

module.exports = router;
