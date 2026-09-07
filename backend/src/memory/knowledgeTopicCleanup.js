const { isDeepStrictEqual: equal } = require('node:util');

function validateChanges(plan) {
    if (plan?.version !== 1 || !Array.isArray(plan.changes) || !plan.changes.length) throw new Error('A version 1 reviewed topic plan is required.');
    const ids = new Set();
    for (const c of plan.changes) {
        if (!Number.isSafeInteger(c.id) || c.id <= 0 || ids.has(c.id)) throw new Error('Record ids must be positive and unique.');
        ids.add(c.id);
        if (!c.expected?.updated_at || !Array.isArray(c.expected.topics) || !Array.isArray(c.topics) || !c.reason?.trim()) throw new Error('Missing review details.');
        if (new Set(c.topics).size !== c.topics.length || c.topics.some(t => typeof t !== 'string' || !c.expected.topics.includes(t)) || c.topics.length >= c.expected.topics.length) {
            throw new Error('Cleanup must only remove reviewed tags.');
        }
    }
    return plan.changes;
}

function assertUnchanged(row, expected) {
    if (!row || Object.entries(expected).some(([key, value]) => !equal(row[key], value))) throw new Error('Record changed since review; stop and review again.');
}

function assertTopicsOnly(before, after, topics) {
    const withoutMetadata = row => Object.fromEntries(Object.entries(row).filter(([key]) => !['topics', 'updated_at'].includes(key)));
    if (!after || !equal(after.topics, topics) || !equal(withoutMetadata(before), withoutMetadata(after))) throw new Error('Unexpected update result; inspect the recovery journal.');
}

function createTopicRepository(client) {
    return {
        async get(id) {
            const { data, error } = await client.from('knowledge_library').select('*').eq('id', id).single();
            if (error) throw new Error(error.message);
            return data;
        },
        async replaceTopics(before, topics) {
            const { data, error } = await client.from('knowledge_library').update({ topics })
                .eq('id', before.id).eq('updated_at', before.updated_at).select('*').maybeSingle();
            if (error) throw new Error(error.message);
            if (!data) throw new Error(`Record ${before.id} changed during cleanup; no update applied.`);
            return data;
        }
    };
}

async function previewCleanup(plan, repository) {
    const snapshots = [];
    for (const change of validateChanges(plan)) {
        const before = await repository.get(change.id);
        assertUnchanged(before, change.expected);
        if (['superseded', 'contradicted'].includes(before.verification_status) || before.superseded_by) throw new Error('Record is no longer active.');
        snapshots.push({ change, before });
    }
    return snapshots;
}

async function applyCleanup(snapshots, repository, journal) {
    const applied = [];
    for (const { change, before } of snapshots) {
        // Persist the old state before a write, including when its response may be lost.
        await journal({ event: 'intent', id: change.id, before, topics: change.topics, reason: change.reason });
        const after = await repository.replaceTopics(before, change.topics);
        await journal({ event: 'applied', id: change.id, before, after });
        assertTopicsOnly(before, after, change.topics);
        applied.push(after);
    }
    return applied;
}

async function rollbackCleanup(entries, repository, journal) {
    const completed = entries.filter(e => e.event === 'applied');
    const restored = new Set(entries.filter(e => e.event === 'restored').map(e => e.id));
    if (entries.some(e => e.event === 'intent' && !completed.some(done => done.id === e.id))) throw new Error('An update has an uncertain outcome; inspect its intent snapshot before rollback.');
    for (const entry of [...completed].reverse()) {
        if (restored.has(entry.id)) continue;
        const current = await repository.get(entry.id);
        assertUnchanged(current, entry.after);
        await journal({ event: 'restore_intent', id: entry.id, before: current, topics: entry.before.topics });
        const after = await repository.replaceTopics(current, entry.before.topics);
        await journal({ event: 'restored', id: entry.id, after });
        assertTopicsOnly(current, after, entry.before.topics);
    }
}

module.exports = { validateChanges, assertUnchanged, assertTopicsOnly, createTopicRepository, previewCleanup, applyCleanup, rollbackCleanup };
