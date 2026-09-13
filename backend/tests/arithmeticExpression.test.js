const assert = require('node:assert/strict');
const { normalizeArithmeticExpression } = require('../src/utils/arithmeticExpression');
const { execute: calculate } = require('../src/tools/utilities/calculate');

async function run() {
    for (const [input, result] of [
        ['two plus two', 4], ['eighteen times seven', 126], ['18 times 7', 126],
        ['one hundred and five minus six', 99], ['twenty-one divided by three', 7],
        ['negative five plus two', -3], ['zero plus five', 5], ['(2 + 3) * 4', 20],
        ['.5 * 2', 1], ['nine hundred ninety nine minus ninety nine', 900]
    ]) {
        assert.match(await calculate(input), new RegExp(`is ${result}\\.$`), input);
    }
    for (const input of ['18 times apples 7', 'two two', 'one thousand', 'one and two',
        'two point five', '2two', 'two2', '2 + 2abc', '', 'one hundred and', 'two meters plus three meters']) {
        assert.equal(normalizeArithmeticExpression(input), null, input);
        assert.match(await calculate(input), /^Error:/, input);
    }
    assert.equal(normalizeArithmeticExpression(null), null);
    assert.equal(normalizeArithmeticExpression('2 + 2'), '2 + 2');
    console.log('arithmeticExpression.test.js: all assertions passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
