require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const sessionManager = require('../src/memory/sessionManager');
const reflectionEngine = require('../src/memory/reflectionEngine');
const { ReflectionWorker } = require('../src/memory/reflectionWorker');

function parseArgs(argv) {
    const options = { apply: false, details: false, skip: false, limit: 5, sessionIds: [] };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--apply') {
            options.apply = true;
        } else if (arg === '--details') {
            options.details = true;
        } else if (arg === '--skip') {
            options.skip = true;
        } else if (arg === '--limit') {
            options.limit = Number(argv[++index]);
        } else if (arg === '--ids') {
            options.sessionIds = String(argv[++index] || '')
                .split(',')
                .map(value => Number(value.trim()))
                .filter(Number.isInteger);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 50) {
        throw new Error('--limit must be an integer between 1 and 50.');
    }
    if (options.apply && options.skip) {
        throw new Error('Use either --apply or --skip, not both.');
    }
    if (options.skip && options.sessionIds.length === 0) {
        throw new Error('--skip requires explicit --ids.');
    }
    return options;
}

function shorten(value, maxLength = 100) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function printCandidates(candidates) {
    if (candidates.length === 0) {
        console.log('No backfill_pending sessions matched.');
        return;
    }

    for (const session of candidates) {
        console.log(
            `Session ${session.id} | ${session.messageCount} messages | ` +
            `${session.title || 'untitled'} | ${shorten(session.preview) || 'no user preview'}`
        );
    }
}

async function printCandidateDetails(candidates, sessions) {
    for (const candidate of candidates) {
        const history = await sessions.getSessionMessages(candidate.id);
        const userTurns = history.filter(message => message.role === 'user');
        console.log(`\nSession ${candidate.id} user turns:`);
        for (const [index, message] of userTurns.entries()) {
            console.log(`  ${index + 1}. ${shorten(message.content, 180)}`);
        }
    }
}

async function run(argv = process.argv.slice(2), dependencies = {}) {
    const options = parseArgs(argv);
    const sessions = dependencies.sessions || sessionManager;
    const engine = dependencies.engine || reflectionEngine;
    const candidates = await sessions.listReflectionBackfillCandidates(
        options.limit,
        options.sessionIds
    );

    printCandidates(candidates);
    if (options.details && candidates.length > 0) {
        await printCandidateDetails(candidates, sessions);
    }
    if (options.skip && candidates.length > 0) {
        const results = [];
        for (const candidate of candidates) {
            const result = await sessions.skipReflectionBackfill(candidate.id);
            results.push(result);
            console.log(`Session ${candidate.id}: skipped after review.`);
        }
        return { preview: false, candidates, results };
    }
    if (!options.apply || candidates.length === 0) {
        if (candidates.length > 0) {
            console.log('Preview only. Add --apply to process this batch.');
        }
        return { preview: true, candidates, results: [] };
    }

    const worker = new ReflectionWorker({ sessions, engine, enabled: true });
    const results = [];
    try {
        for (const candidate of candidates) {
            const result = await worker.processBackfillSession(candidate.id);
            results.push(result);
            console.log(`Session ${candidate.id}: ${result.status}.`);
        }
    } finally {
        worker.shutdown();
    }

    return { preview: false, candidates, results };
}

if (require.main === module) {
    run().then(result => {
        if (result.results.some(item => item.status === 'failed')) {
            process.exitCode = 1;
        }
    }).catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { parseArgs, shorten, printCandidates, printCandidateDetails, run };
