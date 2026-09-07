require('dotenv').config();

const knowledgeLibrary = require('../src/memory/knowledgeLibrary');
const { isKnowledgeActive } = require('../src/memory/knowledgeAudit');
const {
    looksComposite,
    planAtomicDecomposition
} = require('../src/memory/knowledgeAtomicityPlanner');

function requestedIds() {
    return process.argv.slice(2)
        .flatMap(argument => argument.split(','))
        .map(Number)
        .filter(Number.isSafeInteger);
}

async function main() {
    const rows = await knowledgeLibrary.getAll({ throwOnError: true });
    const ids = requestedIds();
    const targets = rows.filter(row =>
        isKnowledgeActive(row) &&
        (ids.length > 0 ? ids.includes(Number(row.id)) : looksComposite(row))
    );
    const plans = [];
    for (const row of targets) {
        plans.push(await planAtomicDecomposition(row, rows));
    }

    console.log(JSON.stringify({
        mode: 'review_only',
        note: 'No knowledge records were inserted, updated, superseded, or deleted.',
        summary: {
            inspected: targets.length,
            review_ready: plans.filter(plan => plan.status === 'review_ready').length,
            review_required: plans.filter(plan => plan.status === 'review_required').length
        },
        plans
    }, null, 2));
}

main().catch(error => {
    console.error(`Knowledge atomicity planning failed: ${error.message}`);
    process.exitCode = 1;
});
