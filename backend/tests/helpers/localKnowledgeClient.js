// Minimal transport adapter for tests. SQL functions and stored rows are real;
// only the PostgREST HTTP transport is replaced. Never loads Supabase credentials.
function createLocalClient(getDatabase) {
    const functions = {
        ingest_knowledge_candidate: ['p_candidate', 'p_expected', 'p_equivalent', 'p_force_review', 'p_reason'],
        resolve_knowledge_ingestion_review: ['p_review_id', 'p_action', 'p_reason', 'p_expected_review', 'p_expected_current'],
        maintain_knowledge_record: ['p_action', 'p_record_id', 'p_review_id', 'p_reason', 'p_expected_current', 'p_expected_review']
    };
    return {
        async rpc(name, args) {
            if (!functions[name]) throw new Error(`Unsupported test RPC: ${name}`);
            const keys = functions[name];
            const values = keys.map(key => args[key] && typeof args[key] === 'object' ? JSON.stringify(args[key]) : args[key] ?? null);
            try {
                const result = await getDatabase().query(`select public.${name}(${keys.map((key, index) => `${key} => $${index + 1}`).join(', ')}) as data`, values);
                return { data: result.rows[0].data };
            } catch (error) { return { error: { message: error.message, code: error.code } }; }
        },
        from(table) {
            if (!['knowledge_library', 'knowledge_ingestion_reviews', 'knowledge_maintenance_events'].includes(table)) throw new Error(`Unsupported test table: ${table}`);
            const filters = [];
            let ordering = '', limit = '';
            function identifier(field) {
                if (!/^[a-z_]+$/.test(field)) throw new Error('Invalid test identifier');
                return `"${field}"`;
            }
            async function read(single = false) {
                const where = filters.length ? `where ${filters.map(([field], i) => `${identifier(field)} = $${i + 1}`).join(' and ')}` : '';
                const result = await getDatabase().query(`select to_jsonb(t) as record from public.${table} t ${where} ${ordering} ${limit}`, filters.map(([, value]) => value));
                const rows = result.rows.map(row => row.record);
                if (single && rows.length > 1) throw new Error('Expected at most one row');
                return { data: single ? rows[0] || null : rows };
            }
            const query = {
                select: () => query,
                eq: (key, value) => { filters.push([key, value]); return query; },
                order: (key, options) => { ordering = `order by ${identifier(key)} ${options?.ascending === false ? 'desc' : 'asc'}`; return query; },
                limit: count => { if (!Number.isSafeInteger(count) || count < 1) throw new Error('Invalid limit'); limit = `limit ${count}`; return query; },
                maybeSingle: () => read(true),
                then: (resolve, reject) => read().then(resolve, reject)
            };
            return query;
        }
    };
}
module.exports = { createLocalClient };
