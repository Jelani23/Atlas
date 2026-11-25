function convert(x) { return x + 100; }
function apply(convert) { return convert(3); }
function entry() { return apply(x => x * 2); }

module.exports = { apply, entry };

