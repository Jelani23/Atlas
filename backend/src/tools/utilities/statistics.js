// src/tools/utilities/statistics.js
async function statistics(dataString) {
    try {
        const numbers = dataString.split(/[\s,]+/).map(n => parseFloat(n)).filter(n => !isNaN(n));
        if (numbers.length === 0) return "Error: No valid numbers found.";
        
        const sum = numbers.reduce((a, b) => a + b, 0);
        const mean = sum / numbers.length;
        const sorted = [...numbers].sort((a, b) => a - b);
        const median = sorted.length % 2 === 0 ? (sorted[sorted.length/2 - 1] + sorted[sorted.length/2]) / 2 : sorted[Math.floor(sorted.length/2)];
        
        const counts = {};
        let maxCount = 0;
        let mode = numbers[0];
        for (const num of numbers) {
            counts[num] = (counts[num] || 0) + 1;
            if (counts[num] > maxCount) {
                maxCount = counts[num];
                mode = num;
            }
        }

        return `Statistics for [${numbers.join(', ')}]:\nCount: ${numbers.length}\nSum: ${sum}\nMean: ${mean.toFixed(2)}\nMedian: ${median}\nMode: ${mode}\nMin: ${Math.min(...numbers)}\nMax: ${Math.max(...numbers)}`;
    } catch (error) {
        return `Error calculating statistics: ${error.message}`;
    }
}

module.exports = {
    execute: statistics,
    intentSchema: {
        name: 'statistics',
        domain: 'MATH',
        triggers: ["statistics","average","mean","median"],
        requiredEntities: ["NUMBER"],
        extractParams: (message, entities) => {
        const match = message.match(/(?:average of|mean of|statistics for|median of)\s+(.*)/i);
        return [match ? match[1].trim() : null];
    }
    }
};
