function createRepository(client) {
    async function rpc(name, args) {
        const { data, error } = await client.rpc(name, args);
        if (error) throw new Error(`Passive learning database: ${error.message}. Check migration 015.`);
        return data;
    }
    return {
        claim: source => rpc('claim_knowledge_learning', { p_source_key: source.id, p_source_url: source.url }),
        async finish(run, status, result, fingerprint, intervalSeconds) {
            const data = await rpc('finish_knowledge_learning', {
                p_run_id: run.id, p_status: status, p_result: result,
                p_fingerprint: fingerprint || null, p_interval_seconds: intervalSeconds
            });
            if (data !== true) throw new Error('Learning completion was not confirmed');
        },
        async status() {
            const { data, error } = await client.from('knowledge_learning_runs').select('*')
                .order('started_at', { ascending: false }).limit(12);
            if (error) throw new Error(error.message);
            return data;
        }
    };
}
module.exports = { createRepository };
