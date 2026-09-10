const fs = require('node:fs/promises');
const path = require('node:path');
const { createPlan, applyPlan } = require('../src/memory/knowledgeReviewResolution');

function parseArgs(args) {
    if (args.length === 2 && args[0] === '--apply' && args[1] && !args[1].startsWith('--')) {
        return { apply: args[1] };
    }
    const options = {};
    for (let index = 0; index < args.length; index += 2) {
        const key = args[index];
        const value = args[index + 1];
        if (!['--review', '--action', '--reason', '--out'].includes(key) || Object.hasOwn(options, key) ||
            !value || value.startsWith('--')) throw new Error('Invalid or duplicate preview option.');
        options[key] = value;
    }
    if (!/^[1-9]\d*$/.test(options['--review'] || '') ||
        !['dismiss', 'accept_provisional'].includes(options['--action']) || !options['--reason']?.trim()) {
        throw new Error('Use --review <review-id> --action dismiss|accept_provisional --reason "..." [--out <plan.json>], or --apply <reviewed-plan.json>.');
    }
    return options;
}

async function main(args) {
    const options = parseArgs(args);
    require('dotenv').config({ quiet: true });
    const client = require('../src/database/supabaseClient');
    if (options.apply) {
        const plan = JSON.parse(await fs.readFile(path.resolve(options.apply), 'utf8'));
        const result = await applyPlan(client, plan);
        console.log(JSON.stringify({ mode: 'applied', result,
            reminder: 'Restart a running Atlas backend before checking recall; this separate CLI cannot invalidate its in-process cache.' }, null, 2));
        return;
    }
    const repository = require('../src/memory/knowledgeIngestionRepository').createRepository(client);
    const details = await repository.inspectReview(options['--review']);
    const plan = createPlan(details, options['--action'], options['--reason']);
    if (options['--out']) {
        // Never overwrite an existing preview or another user file.
        await fs.writeFile(path.resolve(options['--out']), JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
    }
    console.log(JSON.stringify({ mode: 'preview_only', plan,
        warning: 'Acceptance replaces the claim provisionally and clears old verification, confidence, and topic tags. It does not verify it. No database changes were made.' }, null, 2));
}

if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { parseArgs };
