async function readReviews(args, repository) {
    if (args.length === 0) {
        const rows = await repository.listPending();
        return { mode: 'read_only', pending: rows.length, limit: 50, reviews: rows };
    }
    if (args.length !== 2 || args[0] !== '--id' || !/^[1-9]\d*$/.test(args[1])) {
        throw new Error('Usage: npm run knowledge:ingestion-review [-- --id <review-id>]');
    }
    const details = await repository.inspectReview(args[1]);
    return { mode: 'read_only', review_id: args[1], found: details !== null, details };
}

if (require.main === module) {
    require('dotenv').config({ quiet: true });
    const client = require('../src/database/supabaseClient');
    const repository = require('../src/memory/knowledgeIngestionRepository').createRepository(client);
    readReviews(process.argv.slice(2), repository).then(result => {
        console.log(JSON.stringify(result, null, 2));
    }).catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { readReviews };
