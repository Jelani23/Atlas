// backend/src/intent/entityExtractor.js

function extractEntities(message) {
    const entities = [];
    const lower = message.toLowerCase();

    // 1. TASK_ID
    const taskIdMatch = message.match(/\b(TASK-|BG-)(\d{3,4})\b/i);
    if (taskIdMatch) {
        entities.push({ type: 'TASK_ID', value: taskIdMatch[0].toUpperCase(), confidence: 0.99 });
    }

    // 2. FILE
    const fileMatch = message.match(/([\w\/]+\.(js|json|txt|md|sql))/i);
    if (fileMatch) {
        entities.push({ type: 'FILE', value: fileMatch[1], confidence: 0.95 });
    }

    // 3. PERCENTAGE
    const percentMatch = message.match(/(\d+\.?\d*)\s*(%|percent|percentage)/i);
    if (percentMatch) {
        entities.push({ type: 'PERCENT', value: parseFloat(percentMatch[1]), confidence: 0.95 });
    }

    // 4. CURRENCY (Check this before generic units)
    const currencyRegex = /(\d+\.?\d*)\s*(usd|eur|jpy|gbp|dollars|yen|pounds)/i;
    const currencyMatch = message.match(currencyRegex);
    if (currencyMatch) {
        entities.push({ type: 'NUMBER', value: parseFloat(currencyMatch[1]), confidence: 0.9 });
        entities.push({ type: 'CURRENCY', value: currencyMatch[2].toLowerCase(), confidence: 0.9 });
    }

    // 5. STANDARD UNITS
    if (!currencyMatch) {
        const unitRegex = /(\d+\.?\d*)\s*(cm|centimeters|ft|feet|meters|gb|mb|kb|hours|minutes|seconds)/i;
        const unitMatch = message.match(unitRegex);
        if (unitMatch) {
            entities.push({ type: 'NUMBER', value: parseFloat(unitMatch[1]), confidence: 0.9 });
            entities.push({ type: 'UNIT', value: unitMatch[2].toLowerCase(), confidence: 0.9 });
        }
    }

    // 6. MATH EXPRESSIONS
    const mathMatch = message.match(/(\d+\.?\d*\s*[-+*/]\s*\d+\.?\d*)/);
    if (mathMatch) {
        entities.push({ type: 'MATH_EXPR', value: mathMatch[1], confidence: 0.95 });
    }

    // 7. STANDALONE NUMBERS (Extract ALL numbers, filter out percents later)
    if (!entities.some(e => e.type === 'NUMBER') && !entities.some(e => e.type === 'MATH_EXPR')) {
        const numMatches = [...message.matchAll(/(\d+\.?\d*)/g)];
        for (const match of numMatches) {
            const val = parseFloat(match[1]);
            // Add the number only if it's not already captured as a PERCENT
            if (!entities.some(e => e.type === 'PERCENT' && e.value === val)) {
                entities.push({ type: 'NUMBER', value: val, confidence: 0.5 });
            }
        }
    }

    return entities;
}

module.exports = { extractEntities };