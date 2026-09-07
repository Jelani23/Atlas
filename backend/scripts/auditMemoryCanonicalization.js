require('dotenv').config();

const longTermProfile = require('../src/memory/longTermProfile');
const projectMemory = require('../src/memory/projectMemory');
const knowledgeLibrary = require('../src/memory/knowledgeLibrary');
const proceduralMemory = require('../src/memory/proceduralMemory');
const {
    buildCanonicalizationAudit,
    buildSemanticCanonicalizationAudit
} = require('../src/memory/memoryCanonicalizationAudit');

async function main() {
    const requestedDomain = process.argv.find(argument =>
        ['profile', 'project', 'knowledge', 'procedure'].includes(argument)
    );
    const loaders = {
        profile: () => longTermProfile.get(),
        project: () => projectMemory.get(),
        knowledge: () => knowledgeLibrary.getAll({ throwOnError: true }),
        procedure: () => proceduralMemory.getAll()
    };
    const domains = requestedDomain ? [requestedDomain] : Object.keys(loaders);
    const semantic = process.argv.includes('--semantic');
    const reports = [];

    for (const domain of domains) {
        const rows = await loaders[domain]();
        reports.push(semantic
            ? await buildSemanticCanonicalizationAudit(domain, rows)
            : buildCanonicalizationAudit(domain, rows));
    }

    console.log(JSON.stringify({
        mode: semantic ? 'semantic_dry_run' : 'dry_run',
        note: 'Potential matches are candidates for semantic review, not automatic merge instructions.',
        reports
    }, null, 2));
}

main().catch(error => {
    console.error(`Memory canonicalization audit failed: ${error.message}`);
    process.exitCode = 1;
});
