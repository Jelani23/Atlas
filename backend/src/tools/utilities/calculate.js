// src/tools/utilities/calculate.js
const { normalizeArithmeticExpression } = require('../../utils/arithmeticExpression');
async function calculate(expression) {
    try {
        const sanitized = normalizeArithmeticExpression(expression);
        if (!sanitized) return "Error: Invalid mathematical expression.";
        const result = new Function(`return ${sanitized}`)();
        return `The result of ${sanitized} is ${result}.`;
    } catch (error) {
        return `Error calculating: ${error.message}`;
    }
}

module.exports = {
    execute: calculate,
    intentSchema: {
        name: 'calculate',
        domain: 'MATH',
        triggers: ['calculate', 'math', 'times', 'plus', 'minus', 'divided by', '*'],
        requiredEntities: ["MATH_EXPR"],
        extractParams: (message, entities) => {
        const mathExpr = entities.find(e => e.type === 'MATH_EXPR');
        return [mathExpr ? mathExpr.value : null];
    }
    }
};
