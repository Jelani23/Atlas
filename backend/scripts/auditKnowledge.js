require('dotenv').config();

const knowledgeLibrary = require('../src/memory/knowledgeLibrary');
const { auditKnowledgeRows } = require('../src/memory/knowledgeAudit');

async function main() {
    const rows = await knowledgeLibrary.getAll({ throwOnError: true });
    const report = auditKnowledgeRows(rows);
    const flaggedOnly = process.argv.includes('--flagged-only');
    const summaryOnly = process.argv.includes('--summary-only');

    console.log(JSON.stringify({
        summary: report.summary,
        ...(summaryOnly ? {} : {
            records: flaggedOnly
                ? report.records.filter(record => record.issues.length > 0)
                : report.records
        })
    }, null, 2));
}

main().catch(error => {
    console.error(`Knowledge audit failed: ${error.message}`);
    process.exitCode = 1;
});
