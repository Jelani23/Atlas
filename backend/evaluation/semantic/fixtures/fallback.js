function renderValue(value) {
  const chosen = value || '';
  return String(chosen).trim();
}
module.exports = { renderValue };

