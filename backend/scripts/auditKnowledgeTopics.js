require('dotenv').config();

const knowledgeLibrary = require('../src/memory/knowledgeLibrary');
const { isKnowledgeActive } = require('../src/memory/knowledgeAudit');
const { assessKnowledgeTopics } = require('../src/memory/knowledgeTopicPolicy');

async function main() {
    const rows = (await knowledgeLibrary.getAll({ throwOnError: true })).filter(isKnowledgeActive);
    const proposals = rows.map(row => {
        const assessment = assessKnowledgeTopics(row);
        return {
            id: row.id, subject: row.subject, key: row.key, value: row.value,
            verification_status: row.verification_status, updated_at: row.updated_at,
            current_topics: row.topics, proposed_topics: assessment.supported,
            review: assessment.review
        };
    }).filter(row => row.review.length);
    console.log(JSON.stringify({
        mode: 'review_only',
        note: 'No records changed. Missing textual support does not prove a topic is incorrect.',
        active_records: rows.length,
        records_needing_review: proposals.length,
        proposals
    }, null, 2));
}

main().catch(error => {
    console.error(`Knowledge topic audit failed: ${error.message}`);
    process.exitCode = 1;
});
