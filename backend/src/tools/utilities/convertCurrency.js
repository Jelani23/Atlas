// src/tools/utilities/convertCurrency.js
async function convertCurrency(amount, fromCurrency, toCurrency) {
    try {
        const amt = parseFloat(amount);
        if (isNaN(amt)) return "Error: Invalid amount provided.";

        const from = fromCurrency.toUpperCase();
        const to = toCurrency.toUpperCase();

        const response = await fetch(`https://open.er-api.com/v6/latest/${from}`);
        if (!response.ok) return `Error: Could not fetch exchange rates.`;
        
        const data = await response.json();
        const rate = data.rates[to];
        
        if (!rate) return `Error: Could not find exchange rate from ${from} to ${to}.`;
        
        const result = amt * rate;
        return `${amt} ${from} is approximately ${result.toFixed(2)} ${to}.`;
    } catch (error) {
        return `Error converting currency: ${error.message}`;
    }
}

module.exports = {
    execute: convertCurrency,
    intentSchema: {
        name: 'convertCurrency',
        domain: 'MATH',
        triggers: ["convert","usd","eur","jpy","gbp","dollars","yen","pounds"],
        requiredEntities: ["NUMBER","CURRENCY"],
        extractParams: (message, entities) => {
        const num = entities.find(e => e.type === 'NUMBER');
        const curr = entities.find(e => e.type === 'CURRENCY');
        const targetMatch = message.match(/to\s+(usd|eur|jpy|gbp|dollars|yen|pounds)/i);
        return [
            num ? num.value : null,
            curr ? curr.value : null,
            targetMatch ? targetMatch[1] : null
        ];
    }
    }
};
