function width(text) { return text.length; }
function handle(raw) { return width(String(raw || '')); }

module.exports = { width, handle };

