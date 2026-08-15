require('dotenv').config({
    path: require('path').join(__dirname, '../.env')
});

const assert = require('assert');

const memoryManager = require('../src/memory/memoryManager');
const longTermProfile = require('../src/memory/longTermProfile');

const TEST_KEY = '__race_condition_test__';

async function cleanup() {
    try {
        await longTermProfile.remove('state', TEST_KEY);
    } catch (error) {
        // The test may be running against a memory store that does not yet
        // expose remove(). In that case, cleanup is handled by the overwrite
        // performed during the test.
        console.warn(
            '[RaceTest] Cleanup warning:',
            error.message
        );
    }
}

async function readTestMemory() {
    return await longTermProfile.find(
        'state',
        TEST_KEY
    );
}

async function saveMemory(value) {
    return await memoryManager.handleMemoryAction({
        category: 'state',
        key: TEST_KEY,
        value,
        shouldRemember: true,
        confidence: 1.0
    });
}

async function run() {
    console.log('');
    console.log('=========================================');
    console.log(' MEMORY RACE CONDITION REGRESSION TEST');
    console.log('=========================================');
    console.log('');

    await cleanup();

    console.log('[1/5] Saving initial memory...');

    await saveMemory('INITIAL');

    let current = await readTestMemory();

    assert(
        current,
        'Initial test memory was not saved.'
    );

    assert.strictEqual(
        current.value,
        'INITIAL',
        'Initial test memory has the wrong value.'
    );

    console.log('      ✓ Initial memory saved.');

    console.log('');
    console.log('[2/5] Preparing competing writes...');

    /*
     * These represent two background extraction results.
     *
     * OLD represents an extraction that began earlier.
     * NEW represents an extraction that began later.
     *
     * The important invariant is:
     *
     *     NEWER CONTEXT MUST NEVER BE OVERWRITTEN
     *     BY AN OLDER BACKGROUND EXTRACTION.
     */

    const oldMemory = {
        category: 'state',
        key: TEST_KEY,
        value: 'OLD',
        shouldRemember: true,
        confidence: 1.0
    };

    const newMemory = {
        category: 'state',
        key: TEST_KEY,
        value: 'NEW',
        shouldRemember: true,
        confidence: 1.0
    };

    console.log('      OLD value = OLD');
    console.log('      NEW value = NEW');

    console.log('');
    console.log('[3/5] Simulating newer extraction completing first...');

    /*
     * NEW finishes first.
     */
    await memoryManager.handleMemoryAction(newMemory);

    current = await readTestMemory();

    assert(
        current,
        'Memory disappeared after NEW write.'
    );

    assert.strictEqual(
        current.value,
        'NEW',
        'NEW extraction did not become the canonical value.'
    );

    console.log('      ✓ NEW value committed.');

    console.log('');
    console.log('[4/5] Simulating older extraction completing afterward...');

    /*
     * OLD finishes second.
     *
     * This is the critical operation.
     *
     * Before the race-condition fix, this will probably overwrite NEW.
     *
     * After the fix, OLD must be rejected as stale.
     */
    const oldResult =
        await memoryManager.handleMemoryAction(oldMemory);

    current = await readTestMemory();

    console.log(
        '      OLD save result:',
        oldResult
    );

    console.log(
        '      Final database value:',
        current?.value
    );

    assert(
        current,
        'Memory disappeared after OLD write attempt.'
    );

    assert.strictEqual(
        current.value,
        'NEW',
        [
            '',
            'RACE CONDITION DETECTED:',
            'The older extraction overwrote newer context.',
            '',
            `Expected: NEW`,
            `Actual:   ${current.value}`
        ].join('\n')
    );

    console.log(
        '      ✓ OLD extraction was prevented from overwriting NEW.'
    );

    console.log('');
    console.log('[5/5] Verifying persistence...');

    /*
     * Read directly from the memory store again.
     *
     * This makes sure the result is actually persisted and isn't merely
     * correct in an in-memory cache.
     */
    const persisted = await longTermProfile.find(
        'state',
        TEST_KEY
    );

    assert(
        persisted,
        'Persisted memory could not be found.'
    );

    assert.strictEqual(
        persisted.value,
        'NEW',
        [
            '',
            'PERSISTENCE FAILURE:',
            'The final canonical memory is not NEW.',
            '',
            `Expected: NEW`,
            `Actual:   ${persisted.value}`
        ].join('\n')
    );

    console.log(
        '      ✓ Final canonical value persisted as NEW.'
    );

    await cleanup();

    console.log('');
    console.log('=========================================');
    console.log(' ✅ RACE CONDITION TEST PASSED');
    console.log('=========================================');
    console.log('');
}

run().catch(async error => {
    console.error('');
    console.error('=========================================');
    console.error(' ❌ RACE CONDITION TEST FAILED');
    console.error('=========================================');
    console.error('');
    console.error(error);
    console.error('');

    try {
        await cleanup();
    } catch (_) {
        // Ignore cleanup errors after a failed test.
    }

    process.exit(1);
});