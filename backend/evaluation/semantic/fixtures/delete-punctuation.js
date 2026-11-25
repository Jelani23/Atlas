function joined(text) {
  return text.replace(/[^a-z\s]/g, '').split(/\s+/);
}
module.exports = { joined };

