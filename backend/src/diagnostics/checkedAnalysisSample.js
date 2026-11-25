// Source-only sample for the experimental checked-analysis interface test.
// No production module imports this file. The analysis service reads it as data.
function describeValue(value) {
    if (!value) return 'empty';
    return value.toLowerCase();
}
module.exports = { describeValue };
