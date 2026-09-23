// Real conversation engine/resolver/planner/context builder; synthetic source,
// persona and in-memory history. No production storage, tools, speech or jobs.
require('dotenv').config({quiet:true});
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const cases = require('../tests/fixtures/reviewQualityCases');
const dry = process.argv.includes('--dry-run');
const arg = (name, fallback) => process.argv.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3) ?? fallback;
const selected = cases.filter(c=>!arg('case','') || c.id === arg('case',''));
const modes = arg('mode','both') === 'both' ? ['casual','analysis'] : [arg('mode','both')];
const maxTokens = Number(arg('max-tokens','900'));
assert(selected.length && modes.every(m=>['casual','analysis'].includes(m)), 'Invalid case or mode');
assert(Number.isSafeInteger(maxTokens) && maxTokens > 0 && maxTokens <= 2400, 'Invalid token budget');
process.env.SEMANTIC_MULTI_TOOL_PLANNING = 'false';
function stub(name,exports) {const id=require.resolve(name);require.cache[id]={id,filename:id,loaded:true,exports};}
stub('../src/database/supabaseClient',new Proxy({}, {get(){throw new Error('Audit database access forbidden');}}));
const originalFetch = globalThis.fetch;
globalThis.fetch = (url,options) => {
    if (dry || String(url) !== 'http://localhost:11434/api/chat') throw new Error('Only local model requests allowed');
    return originalFetch(url,options);
};
const bus = new EventEmitter();
stub('../src/events/eventBus',{eventBus:bus});
stub('../src/agents/agentProfiles',{getAgentProfile:async()=>({agentId:'alice',source:'audit_seed',revision:1,profile:require('../src/core/atlasState').atlasState})});
stub('../src/core/contextManager',{getRelevantContext:async()=>({hotState:{activeFiles:[]}})});
stub('../src/tasks/taskManager',{startRequest(){},endRequest(){},createTask(){}});
stub('../src/voice/tts/ttsQueue',{stop(){}});
stub('../src/voice/tts/ttsManager',{enqueue(){},getStatus:()=>({})});
stub('../src/memory/sessionManager',{getWorkingContext:async()=>({})});
let source, activeTurn, modelError;
stub('../src/tools/toolExecutor',{execute:async(name,args)=>{
    assert.equal(name,'readCode','Non-read tool forbidden');
    assert.equal(args[0],'src/auditFixture.js');
    activeTurn.tools.push({name,args});
    return source;
}});
const ollama = require('../src/models/providers/ollama');
const events = require('../src/events/eventTypes');
bus.on(events.REQUEST_FAILED, data=>{modelError ||= new Error(data.error);});
stub('../src/models/modelAdapter',{createModelAdapter:()=>({complete:async(messages,options)=>{
    if (modelError) throw modelError;
    assert(activeTurn.calls.length < 2,'Per-turn model call ceiling exceeded');
    const effective = {...options,temperature:0,think:false,maxTokens,context:8192,keepAlive:'1m',signal:AbortSignal.timeout(45000)};
    const call = {messages,requestedModel:options.model,model:effective.model,maxTokens,context:8192,think:false,temperature:0};
    activeTurn.calls.push(call);
    const start = Date.now();
    const listener = metrics=>{call.metrics=metrics;};
    bus.on(events.LLM_METRICS,listener);
    try {
        call.raw = dry ? (/Return ONLY JSON with "findings"/.test(messages[0].content) ? '{"findings":[],"tests":[]}' : 'Audit wiring placeholder.') : await ollama.complete(messages,effective);
        return call.raw;
    } catch(error) {call.error=error.message;modelError=error;throw error;}
    finally {call.durationMs=Date.now()-start;bus.off(events.LLM_METRICS,listener);}
}})});
const planner = require('../src/planner/planner');
const route = planner.route;
planner.route = async(...args)=>{
    const result=await route(...args);
    activeTurn.route={needsTool:result.needsTool,toolName:result.toolName};
    return result;
};
const {handleMessage} = require('../src/core/conversationEngine');
const state = require('../src/planner/state');
const {formatRange} = require('../src/core/sourceReader');
async function main() {
    const output=path.resolve(__dirname,'../.local/review-quality-audits',`${Date.now()}${dry?'-dry':''}.json`);
    const report={dryRun:dry,scope:'Real resolver/planner/evidence/context builder/engine; synthetic tool result, persona, retrieval and memory. Default model routing retained. Same per-call budgets; review may use two calls. Not full live-app or same-model comparison.',results:[]};
    fs.mkdirSync(path.dirname(output),{recursive:true});
    const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2));
    try {
        for (const fixture of selected) for (const mode of modes) {
            const code=fixture.fn.toString();
            const version=crypto.createHash('sha256').update(code).digest('hex');
            const lines=code.split('\n');
            source=formatRange({path:'src/auditFixture.js',version,startLine:1,endLine:lines.length,totalLines:lines.length,complete:true,nextLine:null,clippedLine:null,text:lines.map((l,i)=>`${i+1}: ${l}`).join('\n')});
            const row={id:fixture.id,mode,source,oracle:fixture.oracle(),rubric:fixture.rubric,manualReview:null,turns:[]};
            report.results.push(row);
            const history=[];
            const memory={workingMemory:{getHistory:async()=>history.slice(-6),append:async m=>{history.push(m);return history.length;}}};
            const sessionId=`quality-${fixture.id}-${mode}`;
            for (const input of ['Read the code for src/auditFixture.js',...fixture.questions]) {
                activeTurn={input,calls:[],tools:[]};row.turns.push(activeTurn);
                const result=await state.runInSession(sessionId,()=>handleMessage(input,{memory,mode,sessionId,taskId:sessionId,requestId:sessionId}));
                activeTurn.reply=result.reply;
                save();
                if (modelError) throw modelError;
                if (row.turns.length === 1) assert.equal(activeTurn.tools.length,1);
                else {
                    assert.equal(activeTurn.tools.length,0,'Follow-up must not execute tools');
                    assert(activeTurn.calls.length,'Follow-up must reach model');
                    assert(activeTurn.calls.some(c=>c.messages.some(m=>m.content.includes(lines[0]))),'Source missing from model context');
                }
                console.log(JSON.stringify({case:fixture.id,mode,turn:row.turns.length,calls:activeTurn.calls.length}));
            }
        }
    } catch(error) {report.error=error.message;process.exitCode=1;}
    finally {save();console.log(JSON.stringify({report:output,error:report.error,semanticVerdict:'Requires manual review; no keyword or length score'}));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
