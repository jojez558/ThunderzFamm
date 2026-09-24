function text(value, field, { required = false, max = 500 } = {}) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (required && !normalized) throw new Error(`${field} is required.`);
  if (normalized.length > max) throw new Error(`${field} is too long.`);
  return normalized;
}

function email(value) {
  const normalized = text(value, "Email", {
    required: true,
    max: 254,
  }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
    throw new Error("Enter a valid email address.");
  return normalized;
}

module.exports = { text, email };
