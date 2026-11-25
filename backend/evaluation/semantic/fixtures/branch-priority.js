function status(text) {
  if (text.includes('DENY')) return false;
  if (text.includes('ALLOW')) return true;
  return text.length > 8;
}
module.exports = { status };

