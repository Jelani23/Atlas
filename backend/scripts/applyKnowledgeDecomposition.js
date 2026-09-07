require('dotenv').config();

const knowledgeLibrary = require('../src/memory/knowledgeLibrary');
const { planAtomicDecomposition } = require('../src/memory/knowledgeAtomicityPlanner');
const {
    applyDecomposition,
    revertDecomposition
} = require('../src/memory/knowledgeDecompositionRepository');
const { positiveId } = require('../src/memory/knowledgeCleanupRepository');

function optionValue(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : null;
}

async function buildPlan(sourceId) {
    const rows = await knowledgeLibrary.getAll({ throwOnError: true });
    const source = rows.find(row => Number(row.id) === sourceId);
    if (!source) throw new Error(`Knowledge record ${sourceId} does not exist.`);
    return { source, plan: await planAtomicDecomposition(source, rows) };
}

async function apply() {
    const sourceId = positiveId(process.argv[3], 'Source');
    const { source, plan } = await buildPlan(sourceId);
    console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'preview', plan }, null, 2));

    if (!process.argv.includes('--apply')) {
        console.log('Preview only. Apply requires --apply, --plan-hash, and --reason after review.');
        return;
    }
    if (!plan.apply_eligible || !plan.approval_hash) {
        throw new Error('This plan is not eligible for automatic application.');
    }
    if (optionValue('--plan-hash') !== plan.approval_hash) {
        throw new Error('The approved plan hash does not match the current plan. Review it again.');
    }

    const reason = optionValue('--reason');
    const components = plan.components.map(component => ({
        source_span: component.source_span,
        destination_id: component.matched_id,
        relation: component.relation
    }));
    const eventId = await applyDecomposition({
        sourceId,
        destinationIds: plan.destination_ids,
        components,
        sourceUpdatedAt: source.updated_at,
        reason
    });
    console.log(`Decomposition recorded as event ${eventId}. The source was superseded, not deleted.`);
}

async function revert() {
    const eventId = positiveId(process.argv[3], 'Event');
    if (!process.argv.includes('--apply')) {
        console.log(`Preview only. Decomposition event ${eventId} would be reverted after safety checks.`);
        return;
    }
    await revertDecomposition(eventId, optionValue('--reason'));
    console.log(`Decomposition event ${eventId} was reverted.`);
}

async function main() {
    const action = String(process.argv[2] || '').toLowerCase();
    if (action === 'apply') return apply();
    if (action === 'revert') return revert();
    throw new Error('Use: apply <sourceId> or revert <eventId>.');
}

main().catch(error => {
    console.error(`Knowledge decomposition failed: ${error.message}`);
    process.exitCode = 1;
});
