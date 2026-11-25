function check(text) { return text.length > 0 ? 'no' : ''; }
function shouldSave(text) { return Boolean(check(text)); }

module.exports = { check, shouldSave };

