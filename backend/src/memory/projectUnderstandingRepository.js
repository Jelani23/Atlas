// Dedicated storage; never falls back to another store after a database error.
function createRepository(client) {
    function identity(key) {
        const [project_key,agent_id,file_path]=JSON.parse(key);
        if(project_key !== 'atlas' || !/^[a-z][a-z0-9_-]{0,63}$/.test(agent_id)
            || !/^src\/.+\.(js|json)$/.test(file_path) || file_path.split('/').includes('..')) throw new Error('Invalid understanding key.');
        return {project_key,agent_id,file_path};
    }
    function check(error) {
        if(error) throw new Error(`Project understanding database unavailable: ${error.message}. Verify migration 017; no local fallback was used.`);
    }
    return {
        label:'database',
        async get(key) {
            const id=identity(key);
            const {data,error}=await client.from('project_understanding').select('record')
                .eq('project_key',id.project_key).eq('agent_id',id.agent_id).eq('file_path',id.file_path).maybeSingle();
            check(error);return data?.record || null;
        },
        async put(key,record) {
            const id=identity(key);
            if(record.project !== id.project_key || record.agentId !== id.agent_id || record.path !== id.file_path) throw new Error('Understanding identity mismatch.');
            const {data,error}=await client.from('project_understanding').upsert({...id,record},
                {onConflict:'project_key,agent_id,file_path'}).select('file_path').single();
            check(error);
            if(data?.file_path !== id.file_path) throw new Error('Database save was not confirmed.');
        }
    };
}
module.exports={createRepository};
