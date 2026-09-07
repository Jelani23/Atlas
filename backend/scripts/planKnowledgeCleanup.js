require('dotenv').config();

const knowledgeLibrary = require('../src/memory/knowledgeLibrary');
const { buildSemanticCanonicalizationAudit } = require('../src/memory/memoryCanonicalizationAudit');
const { buildCleanupProposals } = require('../src/memory/knowledgeCleanupPlanner');

function compactRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        identity: `${row.category}/${row.subject}/${row.key}`,
        value: row.value,
        verification_status: row.verification_status,
        source: row.source,
        last_verified_at: row.last_verified_at,
        updated_at: row.updated_at
    };
}

async function main() {
    const rows = await knowledgeLibrary.getAll({ throwOnError: true });
    const audit = await buildSemanticCanonicalizationAudit('knowledge', rows);
    const proposals = buildCleanupProposals(rows, audit.semantic_suggestions)
        .map(proposal => ({
            relation: proposal.relation,
            confidence: proposal.confidence,
            reason: proposal.reason,
            decision: proposal.decision,
            action: proposal.action,
            left: compactRow(proposal.left),
            right: compactRow(proposal.right),
            records: (proposal.records || []).map(compactRow),
            recommendation: proposal.recommendation || null
        }));

    console.log(JSON.stringify({
        mode: 'review_only',
        note: 'No records were changed. Conflicts are always preserved. Merge directions are recommendations until explicitly applied.',
        summary: {
            records: rows.length,
            proposals: proposals.length,
            recommended: proposals.filter(item => item.decision === 'recommended').length,
            needs_review: proposals.filter(item => item.decision === 'review').length
        },
        proposals
    }, null, 2));
}

main().catch(error => {
    console.error(`Knowledge cleanup planning failed: ${error.message}`);
    process.exitCode = 1;
});
