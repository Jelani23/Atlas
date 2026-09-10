const assert = require('node:assert/strict');
const canonicalizer = require('../src/memory/memoryCanonicalizer');

const incoming = { category: 'knowledge', subject: 'test_service', key: 'support', value: 'Supports offline mode' };
const stored = { ...incoming, id: 1, category: 'technology', verification_status: 'unverified' };
const decision = { candidate_index: 0, relation: 'equivalent', confidence: 0.99, reason: 'Same claim' };

async function run() {
    // These words overlap strongly, but the differences must reach semantic review.
    const pairs = [
        ['Supports offline mode', 'Does not support offline mode'],
        ['Retention is 30 days', 'Retention is 90 days'],
        ['Temperature is -5 C', 'Temperature is 5 C'],
        ['Limit is 10 MB', 'Limit is 10 Mb'],
        ['Works on Linux only', 'Works on Linux and Windows'],
        ['Policy is proposed', 'Policy is implemented']
    ];
    for (const [left, right] of pairs) {
        let evaluated = false;
        const result = await canonicalizer.resolveMemory({ ...incoming, value: left }, {
            rows: [{ ...stored, value: right }],
            evaluate: async () => {
                evaluated = true;
                return { ...decision, relation: 'conflict' };
            }
        });
        assert.equal(evaluated, true, `${left} / ${right} must not be guessed equivalent`);
        assert.equal(result.relation, 'conflict');
    }

    assert.equal(canonicalizer.findStrongEquivalent(incoming, [{
        ...stored, subject: 'unrelated_service', topics: ['test_service']
    }]), null, 'shared topics cannot establish identity');

    for (const relation of ['equivalent', 'update', 'conflict']) {
        const result = canonicalizer.validateDecision({ ...decision, relation }, [{
            ...stored, subject: 'model_8b'
        }], { ...incoming, subject: 'model_70b' });
        assert.equal(result.matched, false, 'model output cannot override explicit variants');
    }
    assert.equal(canonicalizer.findStrongConflict({ ...incoming, subject: 'model_8b', value: 'v1.0' }, [{
        ...stored, subject: 'model_70b', value: 'v2.0'
    }]), null, 'versions of different entities are not the same property conflict');

    assert.equal(canonicalizer.validateDecision(decision, [{
        ...stored, category: 'project', project_key: 'other'
    }], { ...incoming, category: 'project', project_key: 'atlas' }).matched, false);

    assert.equal(canonicalizer.validateDecision(decision, [{
        ...stored, value: 'Offline mode works; export works'
    }], incoming).matched, false, 'even identical keys cannot collapse a composite into a component');

    for (const malformed of [
        { candidate_index: null }, { candidate_index: '0' }, { candidate_index: true },
        { candidate_index: 10 }, { confidence: '0.99' }, { confidence: Infinity },
        { confidence: 1.5 }, { confidence: NaN }
    ]) {
        assert.equal(canonicalizer.validateDecision({ ...decision, ...malformed }, [stored], incoming).matched, false);
    }

    const failed = await canonicalizer.resolveMemory({ ...incoming, value: 'Supports offline access' }, {
        rows: [stored], evaluate: async () => { throw new Error('classifier unavailable'); }
    });
    assert.equal(failed.matched, false);
    assert.equal(failed.memory.value, 'Supports offline access');
    console.log('memoryCanonicalizationSafety.test.js passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
