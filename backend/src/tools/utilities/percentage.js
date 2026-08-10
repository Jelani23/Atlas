// src/tools/utilities/percentage.js
async function percentage(value, total) {
    try {
        const v = parseFloat(value);
        const t = parseFloat(total);
        if (isNaN(v) || isNaN(t) || t === 0) return "Error: Invalid numbers provided.";
        const result = (v / t) * 100;
        return `${v} is ${result.toFixed(2)}% of ${t}.`;
    } catch (error) {
        return `Error calculating percentage: ${error.message}`;
    }
}

module.exports = {
    execute: percentage,
    intentSchema: {
        name: 'percentage',
        domain: 'MATH',
        triggers: ["percent","%"],
        requiredEntities: ["PERCENT"],
        extractParams: (message, entities) => {
            const percent = entities.find(e => e.type === 'PERCENT');
            const nums = entities.filter(e => e.type === 'NUMBER');
            // Find the number that is NOT the percentage value
            const targetNum = nums.find(n => n.value !== percent?.value) || nums[0];
            return [
                percent ? percent.value : null,
                targetNum ? targetNum.value : null
            ];
        }
    }
};
