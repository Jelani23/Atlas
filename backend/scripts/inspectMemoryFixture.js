// Exact token filtered inspection; never writes or prints unrelated records.
require('dotenv').config({ quiet: true });
const client = require('../src/database/supabaseClient');
async function main() {
    const token = process.argv[2];
    if (!/^[a-z][a-z0-9_]{2,80}$/.test(token || '')) throw new Error('Supply one literal lowercase fixture token.');
    const pattern = `%${token.replace(/_/g, '\\_')}%`;
    const result = {};
    for (const table of ['project_memory', 'knowledge_library']) {
        const query = await client.from(table).select('*')
            .or(`subject.eq.${token},key.ilike.${pattern},value.ilike.${pattern}`)
            .abortSignal(AbortSignal.timeout(30000));
        if (query.error) throw new Error(query.error.message);
        result[table] = query.data;
    }
    console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
