// Quick sanity check to run right after setting SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// and applying supabase_schema.sql, BEFORE running the full data migration.
// Confirms: credentials are valid, and every expected table exists and is reachable.
//
// Usage: node scripts/checkSupabaseConnection.js

require('dotenv').config();
const supabase = require('../src/database/supabaseClient');

const EXPECTED_TABLES = [
    'sessions',
    'conversations',
    'user_profile',
    'project_memory',
    'knowledge_library',
    'procedural_memory',
    'dev_state',
    'reflections',
    'world_model'
];

async function main() {
    console.log('Checking Supabase connection...\n');

    let allOk = true;

    for (const table of EXPECTED_TABLES) {
        const { error, count } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true });

        if (error) {
            allOk = false;
            console.log(`  ✗ ${table.padEnd(20)} ${error.message}`);
        } else {
            console.log(`  ✓ ${table.padEnd(20)} reachable (${count ?? 0} rows)`);
        }
    }

    console.log();
    if (allOk) {
        console.log('All tables reachable. You\'re good to run: npm run migrate:supabase');
    } else {
        console.log('Some tables failed. Most likely cause: supabase_schema.sql hasn\'t');
        console.log('been run yet in the Supabase SQL editor, or the service_role key is wrong.');
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Connection check failed:', err.message);
    process.exit(1);
});
