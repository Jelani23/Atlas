// Real resolver, planner, tool execution, evidence retention and conversation
// engine. Only model, storage, background scheduling and speech are replaced.
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.SEMANTIC_MULTI_TOOL_PLANNING = 'false';
globalThis.fetch = async () => {throw new Error('Network forbidden');};
function stub(name,exports) {const id=require.resolve(name);require.cache[id]={id,filename:id,loaded:true,exports};}
const prompts=[];
const events=[];
stub('../src/agents/agentProfiles',{getAgentProfile:async()=>({agentId:'alice',source:'database',revision:1,profile:require('../src/core/atlasState').atlasState})});
stub('../src/models/modelAdapter',{createModelAdapter:()=>({complete:async messages=>{
    prompts.push(messages);
    return /Return ONLY JSON with "findings"/.test(messages[0].content) ? '{"findings":[]}' : 'A source-backed explanation.';
}})});
stub('../src/core/contextManager',{getRelevantContext:async()=>({hotState:{activeFiles:[]}})});
stub('../src/tasks/taskManager',{startRequest(){},endRequest(){},createTask(){}});
stub('../src/events/eventBus',{eventBus:{emit:(...args)=>events.push(args),on(){}}});
stub('../src/voice/tts/ttsQueue',{stop(){}});
stub('../src/voice/tts/ttsManager',{enqueue(){},getStatus:()=>({})});
stub('../src/memory/sessionManager',{getWorkingContext:async()=>({})});
const planner=require('../src/planner/planner');
const route=planner.route;
const routes=[];
planner.route=async(...args)=>{const result=await route(...args);routes.push(result);return result;};
const {resolve}=require('../src/intent/intentResolver');
const {handleMessage}=require('../src/core/conversationEngine');
const state=require('../src/planner/state');
const history=[];
const memory={workingMemory:{getHistory:async()=>history.slice(-4),append:async message=>{history.push(message);return history.length;}}};
async function ask(input,mode='casual') {
    const result=await state.runInSession('source-integration',()=>handleMessage(input,{memory,mode,sessionId:'source-integration',taskId:'test',requestId:'test'}));
    assert(!events.some(([type])=>type==='request_failed'),JSON.stringify(events));
    return result.reply;
}
async function main() {
    await require('../src/core/projectCache').initialize();
    const combined=await ask('Read the code for src/core/contextManager.js lines 81-100, then read the next page');
    assert.match(combined,/"startLine":81,"endLine":100/);
    assert.match(combined,/"startLine":101,"endLine":180/);
    assert.match(await ask('read the next page'),/"startLine":181/);
    assert.match(await ask('Read  out agentProfiles'),/Content of src\/agents\/agentProfiles.js/);
    const question='Based on that code, what happens if the database read fails after a profile was already cached?';
    assert.notEqual(resolve(question).winner,'readCode');
    assert.equal(await ask(question),'A source-backed explanation.');
    assert.equal(routes.at(-1).needsTool,false);
    assert.match(prompts.at(-1)[0].content,/PREVIOUS CODE-READ EVIDENCE/);
    assert.match(prompts.at(-1)[0].content,/cached_database/);
    const reviewed=await ask('Review that code for bugs and suggest tests');
    assert.equal(routes.at(-1).needsTool,false);
    assert.match(reviewed,/No source-linked defect candidate was accepted/);
    assert.match(prompts.at(-1)[1].content,/cached_database/);
    assert.match(reviewed,/No behavioral tests run/);
    const namedQuestion='Does agentProfiles.js handle a failed database read?';
    assert.notEqual(resolve(namedQuestion).winner,'readCode');
    assert.notEqual(require('../src/planner/normalizer').fastRegexNormalizer(namedQuestion).intent,'read_code');
    assert.match(await ask('Read the code for src/missing.js lines 1-2, then read the next page'),/Error reading code/);
    assert.equal(routes.at(-1).codeEvidenceResult,undefined,'Failed first read must not perform a dependent read');
    await ask('What games do you like?');
    assert.doesNotMatch(prompts.at(-1)[0].content,/PREVIOUS CODE-READ EVIDENCE/);
    assert.match(await ask('Read the next page'),/No current, unambiguous/);
    for (const input of ['Do not read out agentProfiles','Explain how deleting a note works, don\'t delete anything',question]) {
        const result=await planner.route(resolve(input),input);
        assert.equal(result.needsTool,false,input);
    }
    console.log('Real source conversation: combined reads, next page, read out, explain, review and non-execution boundaries passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
