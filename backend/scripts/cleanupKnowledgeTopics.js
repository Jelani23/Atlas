require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const client = require('../src/database/supabaseClient');
const { createTopicRepository, previewCleanup, applyCleanup, rollbackCleanup } = require('../src/memory/knowledgeTopicCleanup');

function openJournal(file, flags) {
    const descriptor = fs.openSync(file, flags, 0o600);
    return {
        append(entry) {
            fs.writeSync(descriptor, JSON.stringify({ ...entry, recorded_at: new Date().toISOString() }) + '\n');
            fs.fsyncSync(descriptor);
        },
        close() { fs.closeSync(descriptor); }
    };
}

async function main() {
    const args = process.argv.slice(2);
    const repository = createTopicRepository(client);
    if (args[0] === 'rollback') {
        if (!args[1] || !args.includes('--apply')) throw new Error('Use rollback <journal-path> --apply.');
        const file = path.resolve(args[1]);
        const entries = fs.readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line));
        const journal = openJournal(file, 'a');
        try { await rollbackCleanup(entries, repository, journal.append); }
        finally { journal.close(); }
        console.log('Topic cleanup rollback completed.');
        return;
    }
    if (!args[0]) throw new Error('Use <reviewed-plan.json> [--apply].');
    const plan = JSON.parse(fs.readFileSync(path.resolve(args[0]), 'utf8'));
    const snapshots = await previewCleanup(plan, repository);
    console.log(JSON.stringify({ mode: args.includes('--apply') ? 'apply' : 'preview', changes: snapshots.map(({ change }) => ({
        id: change.id, before: change.expected.topics, after: change.topics, reason: change.reason
    })) }, null, 2));
    if (!args.includes('--apply')) return;
    const folder = path.resolve(__dirname, '../.local/knowledge-topic-cleanup');
    fs.mkdirSync(folder, { recursive: true });
    const file = path.join(folder, `${Date.now()}-${crypto.randomUUID()}.jsonl`);
    const journal = openJournal(file, 'wx');
    console.log(`Recovery journal: ${file}`);
    try {
        journal.append({ event: 'plan', plan });
        const results = await applyCleanup(snapshots, repository, journal.append);
        console.log(`Updated topics on ${results.length} records. Claim values and verification fields were preserved.`);
    } finally { journal.close(); }
}

main().catch(error => { console.error(`Knowledge topic cleanup stopped: ${error.message}`); process.exitCode = 1; });
