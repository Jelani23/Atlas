// Read-only deployment check. Does not generate, import, or save records.
require('dotenv').config({quiet:true});
async function main() {
    const client=require('../src/database/supabaseClient');
    const {count,error}=await client.from('project_understanding').select('project_key',{count:'exact',head:true});
    console.log(JSON.stringify({storage:process.env.PROJECT_UNDERSTANDING_STORAGE || 'local',
        structureEnabled:process.env.PROJECT_UNDERSTANDING_STRUCTURE === 'true',
        accessible:!error,records:count,errorCode:error?.code || null}));
    if(error)process.exitCode=1;
}
main().catch(()=>{console.error('Project understanding check failed; verify database configuration/connectivity.');process.exitCode=1;});
