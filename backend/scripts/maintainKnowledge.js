const fs = require('node:fs/promises');
const path = require('node:path');
const { ACTIONS, createPlan, applyPlan } = require('../src/memory/knowledgeMaintenance');

function parseArgs(args) {
    if (args.length === 2 && args[0] === '--apply' && args[1] && !args[1].startsWith('--')) return { apply: args[1] };
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i], value = args[i + 1];
        if (!['--action', '--record', '--review', '--reason', '--out'].includes(key) ||
            Object.hasOwn(options, key) || !value || value.startsWith('--')) throw new Error('Invalid or duplicate preview option.');
        options[key] = value;
    }
    const target = options['--action'] === 'undo_review' ? '--review' : '--record';
    const other = target === '--review' ? '--record' : '--review';
    if (!ACTIONS.includes(options['--action']) || !/^[1-9]\d*$/.test(options[target] || '') ||
        options[other] || !options['--reason']?.trim()) {
        throw new Error('Use --action recover_verification --record <id>, or --action undo_review --review <id>, with --reason "..." [--out <new-plan.json>]; apply separately with --apply <reviewed-plan.json>.');
    }
    return options;
}

async function main(args) {
    const options = parseArgs(args);
    require('dotenv').config({ quiet: true });
    const client = require('../src/database/supabaseClient');
    if (options.apply) {
        const plan = JSON.parse(await fs.readFile(path.resolve(options.apply), 'utf8'));
        console.log(JSON.stringify({ mode: 'applied', result: await applyPlan(client, plan),
            reminder: 'Restart a running Atlas backend before recall checks. No verification was started.' }, null, 2));
        return;
    }
    let current, review = null;
    if (options['--action'] === 'undo_review') {
        const details = await require('../src/memory/knowledgeIngestionRepository').createRepository(client).inspectReview(options['--review']);
        if (!details) throw new Error('Review not found.');
        ({ current_record: current, review } = details);
        const history = await client.from('knowledge_maintenance_events').select('id').eq('review_id', review.id).eq('action', 'undo_review').limit(1);
        if (history.error) throw new Error(`Cannot inspect undo history: ${history.error.message}. Apply migration 013 first.`);
        if (history.data?.length) throw new Error('This review has already been undone.');
    } else {
        const result = await client.from('knowledge_library').select('*').eq('id', options['--record']).maybeSingle();
        if (result.error) throw new Error(`Cannot inspect knowledge: ${result.error.message}`);
        current = result.data;
    }
    const plan = createPlan(options['--action'], current, review, options['--reason']);
    if (options['--out']) await fs.writeFile(path.resolve(options['--out']), JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ mode: 'preview_only', plan,
        effect: review ? { restored_value: review.resolution_before.value, verification: 'provisional; old evidence and topics are cleared' }
            : { value: current.value, verification: 'failed; old worker ownership invalidated; retry is separate' },
        warning: 'No database changes made. Review the saved plan before applying it. Recovery cancels ownership even if the old worker is still running.' }, null, 2));
}
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { parseArgs };
