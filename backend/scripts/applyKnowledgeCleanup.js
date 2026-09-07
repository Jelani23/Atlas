require('dotenv').config();

const knowledgeLibrary = require('../src/memory/knowledgeLibrary');
const { chooseSurvivor } = require('../src/memory/knowledgeCleanupPlanner');
const {
    mergeEquivalentRecords,
    revertMerge,
    positiveId
} = require('../src/memory/knowledgeCleanupRepository');

function optionValue(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : null;
}

async function merge() {
    const sourceId = positiveId(process.argv[3], 'Source');
    const targetId = positiveId(process.argv[4], 'Target');
    const reason = optionValue('--reason');
    const [source, target] = await Promise.all([
        knowledgeLibrary.getById(sourceId),
        knowledgeLibrary.getById(targetId)
    ]);
    if (!source || !target) throw new Error('Both source and target records must exist.');

    const recommendation = chooseSurvivor(source, target);
    console.log(JSON.stringify({
        mode: process.argv.includes('--apply') ? 'apply' : 'preview',
        source: { id: source.id, identity: `${source.category}/${source.subject}/${source.key}`, value: source.value },
        target: { id: target.id, identity: `${target.category}/${target.subject}/${target.key}`, value: target.value },
        recommendation
    }, null, 2));

    if (!process.argv.includes('--apply')) {
        console.log('Preview only. Add --apply and --reason "..." after reviewing the direction.');
        return;
    }
    if (!reason) throw new Error('--reason is required when applying a merge.');
    if (
        recommendation.decision !== 'recommended' ||
        Number(recommendation.survivor_id) !== targetId
    ) {
        throw new Error('The selected target is not the clear recommended survivor. Review the pair instead of forcing it.');
    }

    const eventId = await mergeEquivalentRecords(sourceId, targetId, reason);
    console.log(`Merge recorded as event ${eventId}. The source was superseded, not deleted.`);
}

async function revert() {
    const eventId = positiveId(process.argv[3], 'Event');
    const reason = optionValue('--reason');
    if (!process.argv.includes('--apply')) {
        console.log(`Preview only. Event ${eventId} would be reverted after safety checks.`);
        return;
    }
    if (!reason) throw new Error('--reason is required when reverting a merge.');
    await revertMerge(eventId, reason);
    console.log(`Merge event ${eventId} was reverted.`);
}

async function main() {
    const action = String(process.argv[2] || '').toLowerCase();
    if (action === 'merge') return merge();
    if (action === 'revert') return revert();
    throw new Error('Use: merge <sourceId> <targetId> or revert <eventId>.');
}

main().catch(error => {
    console.error(`Knowledge cleanup failed: ${error.message}`);
    process.exitCode = 1;
});
