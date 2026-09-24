const buckets = new Map();

function rateLimit({
  windowMs = 60_000,
  max = 30,
  message = "Too many requests. Please try again shortly.",
} = {}) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || now - bucket.startedAt >= windowMs) {
      buckets.set(key, { startedAt: now, count: 1 });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > max) return res.status(429).json({ error: message });
    next();
  };
}

module.exports = rateLimit;
