const { normalizeArithmeticExpression } = require('./arithmeticExpression');

// Parse the whole conversion clause. Requiring both units prevents fragments
// of a general explanation or multi-step instruction from becoming operands.
function parseUnitConversionRequest(message) {
    const match = String(message || '').trim().match(/^(?:please\s+)?(?:(?:can|could|would) you\s+)?(?:please\s+)?convert\s+(.+?)\s+([a-z]+)\s+(?:to|into|in)\s+([a-z]+)[.!?]?$/i);
    if (!match) return null;
    const normalized = normalizeArithmeticExpression(match[1]);
    if (!normalized || !/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
    const value = Number(normalized);
    if (!Number.isFinite(value)) return null;
    return { value, from: match[2].toLowerCase(), to: match[3].toLowerCase() };
}

module.exports = { parseUnitConversionRequest };
