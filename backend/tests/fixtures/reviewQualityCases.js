// Authored fixtures only. These functions are fixed oracles, never model output.
const assert = require('node:assert/strict');

function chooseLabel(value, fallback = 'untitled') {
    if (value == null) return fallback;
    if (typeof value !== 'string') throw new TypeError('Expected string');
    return value.trim() || fallback;
}

function consume(queue, limit) {
    if (!Number.isInteger(limit) || limit < 0) throw new RangeError('Invalid limit');
    const items = queue.splice(0, limit);
    return { items, remaining: queue.length };
}

module.exports = [
    {
        id: 'label-defaults', fn: chooseLabel,
        questions: [
            'Based on that code, explain the branches and preconditions. What happens for null, a whitespace-only string, and false?',
            'For that code, compare an omitted fallback, an explicit undefined fallback, and an empty-string fallback when value is null. Give exact results.',
            'Review that code and suggest concrete behavior tests with inputs and expected outcomes, even if no defect is established. Empty fallback strings are permitted. Do not run or save anything.'
        ],
        rubric: [
            'null and undefined values return fallback before the type guard; false throws TypeError.',
            'Whitespace trims to empty and returns fallback; a nonempty string is trimmed.',
            'Omitted and explicit undefined fallback both use untitled; empty fallback remains empty.',
            'No defect under the stated contract. Tests specify exact arguments and return/throw outcomes, including empty fallback.'
        ],
        oracle() {
            assert.equal(chooseLabel(null), 'untitled');
            assert.equal(chooseLabel(null, undefined), 'untitled');
            assert.equal(chooseLabel(null, ''), '');
            assert.equal(chooseLabel('   '), 'untitled');
            assert.equal(chooseLabel(' a '), 'a');
            assert.throws(() => chooseLabel(false), TypeError);
            return { nullDefault:'untitled', nullUndefined:'untitled', nullEmpty:'', whitespace:'untitled', trimmed:'a', false:'throws TypeError' };
        }
    },
    {
        id: 'queue-mutation', fn: consume,
        questions: [
            'Based on that code, explain the branches and preconditions. With queue [1,2,3] and limit 2, what is returned and what happens to the original queue?',
            'For that code, compare limits 0, 8, and 1.5 with a fresh queue [1,2,3] each time. Give exact return values or errors and the queue afterward.',
            'Review that code and suggest concrete behavior tests with inputs and expected outcomes, even if no defect is established. The caller supplies an ordinary mutable array and mutation is intended. Do not run or save anything.'
        ],
        rubric: [
            'limit 2 returns items [1,2], remaining 1; original array becomes [3].',
            'limit 0 returns items [], remaining 3, unchanged array; limit 8 consumes all and remaining is 0.',
            'limit 1.5 throws RangeError before mutation, leaving [1,2,3]. Use fresh arrays per test.',
            'No defect under the stated contract. Mutation is intended; tests assert both result and original array.'
        ],
        oracle() {
            const results = {};
            for (const [limit, items, remaining] of [[2,[1,2],1],[0,[],3],[8,[1,2,3],0]]) {
                const queue = [1,2,3];
                const result = consume(queue, limit);
                assert.deepEqual(result, {items,remaining});
                assert.deepEqual(queue, [1,2,3].slice(items.length));
                results[limit] = {result, queue};
            }
            const queue = [1,2,3];
            assert.throws(() => consume(queue, 1.5), RangeError);
            assert.deepEqual(queue, [1,2,3]);
            results['1.5'] = {error:'RangeError',queue};
            return results;
        }
    }
];
