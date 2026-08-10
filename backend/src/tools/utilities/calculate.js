// src/tools/utilities/calculate.js
async function calculate(expression) {
    try {
        const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
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
        triggers: ["calculate","math"],
        requiredEntities: ["MATH_EXPR"],
        extractParams: (message, entities) => {
        const mathExpr = entities.find(e => e.type === 'MATH_EXPR');
        return [mathExpr ? mathExpr.value : null];
    }
    }
};
