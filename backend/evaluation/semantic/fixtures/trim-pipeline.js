function tokenCount(text) {
  const clean = text.trim();
  const parts = clean.split(/\s+/);
  return parts.length;
}
module.exports = { tokenCount };

