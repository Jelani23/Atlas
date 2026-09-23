// Fixed offline runner, called only by the registered evidence collector.
globalThis.fetch=async()=>{throw new Error('Network forbidden in profile evidence checks');};
async function main(){
    const contract=require('../src/reasoning/evidenceContracts').contractFor(process.argv[2] || 'src/agents/agentProfiles.js');
    if(!contract)throw new Error('Unsupported evidence source');
    const {cases,oracle}=require(require('node:path').join(__dirname,'..',contract.fixture));
    const results=[];
    for(const c of cases) results.push({id:c.id,symbol:c.symbol,scenario:c.scenario,observed:await oracle(c)});
    process.stdout.write(JSON.stringify(results));
}
main().catch(()=>{process.stderr.write('Fixed profile checks failed.');process.exitCode=1;});
