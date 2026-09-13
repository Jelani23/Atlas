const assert = require('node:assert/strict');
const { execute } = require('../src/tools/utilities/convertUnit');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
const { resolve } = require('../src/intent/intentResolver');
const { parseUnitConversionRequest } = require('../src/utils/unitConversionRequest');
async function main() {
    for (const [message, expected] of [
        ['Convert five kilometers to meters', [5, 'kilometers', 'meters']],
        ['Could you convert twenty one centimeters to inches', [21, 'centimeters', 'inches']],
        ['Convert five meters to kilograms', [5, 'meters', 'kilograms']]
    ]) {
        const route = resolve(message);
        assert.equal(route.state, 'DETERMINISTIC');
        assert.equal(route.winner, 'convertUnit');
        assert.deepEqual(route.params, expected);
    }
    assert.equal(parseUnitConversionRequest('Explain how to convert 5 meters to kilograms'), null);
    assert.equal(parseUnitConversionRequest('Convert 2 plus 2 meters to centimeters'), null);
    assert.equal(parseUnitConversionRequest('Convert five kilometers to meters and then count Atlas'), null);
    assert.notEqual(resolve('Convert five dollars to euros').winner, 'convertUnit');
    assert.equal(await execute(5, 'kilometers', 'meters'), '5 kilometers is equal to 5000.0000 meters.');
    assert.equal(await execute(2, 'kg', 'g'), '2 kg is equal to 2000.0000 g.');
    assert.equal(await execute(1, 'gb', 'mb'), '1 gb is equal to 1024.0000 mb.');
    assert.equal(await execute('0', 'm', 'km'), '0 m is equal to 0.0000 km.');
    assert.equal(await execute(1, ' M ', 'CM'), '1  M  is equal to 100.0000 CM.');
    for (const [from, to] of [['m', 'kg'], ['g', 'bytes'], ['mb', 'ft']]) {
        assert.match(await execute(5, from, to), /^Error:.*different dimensions/);
    }
    for (const value of ['5garbage', '', null, true, Infinity, NaN]) {
        assert.match(await execute(value, 'm', 'km'), /^Error: Invalid number/);
    }
    assert.match(await execute(5, 'constructor', 'm'), /^Error: Unsupported/);
    assert.match(await execute(5, 'hours', 'seconds'), /^Error: Unsupported/);
    assert.match(await execute(Number.MAX_VALUE, 'km', 'm'), /^Error: Conversion result/);
    console.log('Unit conversion: valid results, dimension mismatch and malformed input passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
