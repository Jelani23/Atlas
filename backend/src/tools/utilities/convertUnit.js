// src/tools/utilities/convertUnit.js
const { parseUnitConversionRequest } = require('../../utils/unitConversionRequest');
async function convertUnit(value, fromUnit, toUnit) {
    try {
        const val = Number(value);
        if (!['number', 'string'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(val)) {
            return "Error: Invalid number provided.";
        }

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

        const from = typeof fromUnit === 'string' ? fromUnit.trim().toLowerCase() : '';
        const to = typeof toUnit === 'string' ? toUnit.trim().toLowerCase() : '';
        const f = Object.hasOwn(units, from) ? units[from] : null;
        const t = Object.hasOwn(units, to) ? units[to] : null;

        if (!f || !t) return `Error: Unsupported unit conversion. Supported units include m, cm, km, in, ft, mi, g, kg, lb, oz, b, kb, mb, gb, tb.`;

        const mass = new Set(['g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'mg', 'milligram', 'milligrams', 'lb', 'lbs', 'pound', 'pounds', 'oz', 'ounce', 'ounces']);
        const storage = new Set(['b', 'byte', 'bytes', 'kb', 'kilobyte', 'kilobytes', 'mb', 'megabyte', 'megabytes', 'gb', 'gigabyte', 'gigabytes', 'tb', 'terabyte', 'terabytes']);
        const dimension = unit => mass.has(unit) ? 'mass' : storage.has(unit) ? 'data size' : 'length';
        if (dimension(from) !== dimension(to)) {
            return `Error: Cannot convert ${fromUnit} to ${toUnit}; ${dimension(from)} and ${dimension(to)} are different dimensions.`;
        }

        const result = (val * f) / t;
        if (!Number.isFinite(result)) return 'Error: Conversion result is outside the supported numeric range.';
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
        const request = parseUnitConversionRequest(message);
        if (request && entities.some(entity => entity.type === 'UNIT')) {
            return [request.value, request.from, request.to];
        }
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
