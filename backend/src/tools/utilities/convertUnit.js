// src/tools/utilities/convertUnit.js
async function convertUnit(value, fromUnit, toUnit) {
    try {
        const val = parseFloat(value);
        if (isNaN(val)) return "Error: Invalid number provided.";

        const units = {
            'm': 1, 'meter': 1, 'meters': 1,
            'cm': 0.01, 'centimeter': 0.01, 'centimeters': 0.01,
            'km': 1000, 'kilometer': 1000, 'kilometers': 1000,
            'in': 0.0254, 'inch': 0.0254, 'inches': 0.0254,
            'ft': 0.3048, 'foot': 0.3048, 'feet': 0.3048,
            'yd': 0.9144, 'yard': 0.9144, 'yards': 0.9144,
            'mi': 1609.34, 'mile': 1609.34, 'miles': 1609.34,
            'g': 1, 'gram': 1, 'grams': 1,
            'kg': 1000, 'kilogram': 1000, 'kilograms': 1000,
            'mg': 0.001, 'milligram': 0.001, 'milligrams': 0.001,
            'lb': 453.592, 'lbs': 453.592, 'pound': 453.592, 'pounds': 453.592,
            'oz': 28.3495, 'ounce': 28.3495, 'ounces': 28.3495,
            'b': 1, 'byte': 1, 'bytes': 1,
            'kb': 1024, 'kilobyte': 1024, 'kilobytes': 1024,
            'mb': 1048576, 'megabyte': 1048576, 'megabytes': 1048576,
            'gb': 1073741824, 'gigabyte': 1073741824, 'gigabytes': 1073741824,
            'tb': 1099511627776, 'terabyte': 1099511627776, 'terabytes': 1099511627776
        };

        const f = units[fromUnit.toLowerCase()];
        const t = units[toUnit.toLowerCase()];

        if (!f || !t) return `Error: Unsupported unit conversion. Supported units include m, cm, km, in, ft, mi, g, kg, lb, oz, b, kb, mb, gb, tb.`;

        const result = (val * f) / t;
        return `${val} ${fromUnit} is equal to ${result.toFixed(4)} ${toUnit}.`;
    } catch (error) {
        return `Error converting unit: ${error.message}`;
    }
}

module.exports = {
    execute: convertUnit,
    intentSchema: {
        name: 'convertUnit',
        domain: 'MATH',
        triggers: ['convert', 'how many', 'cm', 'ft', 'feet', 'centimeters', 'meters'],
        requiredEntities: ["NUMBER","UNIT"],
        extractParams: (message, entities) => {
        const num = entities.find(e => e.type === 'NUMBER');
        const fromUnit = entities.find(e => e.type === 'UNIT');
        const targetMatch = message.match(/(?:to|how many)\s+(cm|ft|feet|centimeters|meters|gb|mb|kb|hours|minutes|seconds)/i);
        return [
            num ? num.value : null,
            fromUnit ? fromUnit.value : null,
            targetMatch ? targetMatch[1] : null
        ];
    }
    }
};
