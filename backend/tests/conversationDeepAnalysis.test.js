const assert=require('node:assert/strict'),Module=require('node:module');
const enginePath=require.resolve('../src/core/conversationEngine');
const originalLoad=Module._load;
const tasks=require('../src/tasks/taskManager'),state=require('../src/planner/state');
const {eventBus}=require('../src/events/eventBus');
const events=require('../src/events/eventTypes');
let model,spoken=[],stored=[],completed=0,failed=0;
const fixtures={
    '../models/modelAdapter':{createModelAdapter:()=>({complete:()=>{throw new Error('Wrong model route');}})},
    '../models/providers/ollama':{completeEnvelope:(...args)=>model(...args)},
    '../intent/intentResolver':{resolve:()=>({})},
    '../agents/agentProfiles':{getAgentProfile:async()=>({agentId:'alice',source:'fixture'})},
    '../voice/tts/ttsQueue':{stop(){}},
    '../voice/tts/ttsManager.js':{enqueue:text=>spoken.push(text)},
    '../response/processor':{removeThinkingTraces:x=>x},
    '../voice/tts/speechPreprocessor':{prepareForTTS:x=>x},
    '../memory/knowledgePersistencePolicy':{isSearchKnowledgePersistenceEnabled:()=>false},
    '../memory/projectUnderstanding':{detect:()=>null,configuredRepository:()=>{throw new Error('Deep route opened stored knowledge');}},
    './codeEvidence':{followUp:()=>null}
};
const real=new Set(['../planner/state','../events/eventBus','../events/eventTypes','../tasks/taskManager','../reasoning/projectQuestion','../permissions/permissionManager']);
Module._load=function(request,parent,...args){
    if(parent?.filename===enginePath){
        if(fixtures[request])return fixtures[request];
        if(!real.has(request))return {};
    }
    return originalLoad.call(this,request,parent,...args);
};
const engine=require(enginePath);
eventBus.on(events.REQUEST_COMPLETED,()=>completed++);
eventBus.on(events.REQUEST_FAILED,()=>failed++);
const memory={workingMemory:{getHistory:async()=>[],append:async entry=>{stored.push(entry);return 'fixture';}}};
const command='Deep analyze src/utils/keywordExtractor.js function extractKeywords.';
const envelope=()=>({done:true,done_reason:'stop',message:{role:'assistant',content:JSON.stringify({claims:[{kind:'behavior',text:'Returns a Set of keywords.',assumptions:[],citations:[{path:'src/utils/keywordExtractor.js',line:17}]}],unknowns:[],examples:[]})}});
async function main(){
    model=async()=>envelope();
    const success=await engine.handleMessage(command,{memory,sessionId:'deep-success',taskId:'deep-1',requestId:'r1',agentId:'alice'});
    assert.match(success.reply,/Experimental deep analysis/);assert.equal(spoken.length,1);assert.equal(completed,1);
    await state.runInSession('deep-success',()=>assert.equal(state.projectQuestion.deepAnalysis,true));
    let checkedCalls=0;
    model=async(messages,options)=>{checkedCalls++;assert(options.format.properties.predictions);return {done:true,done_reason:'stop',message:{role:'assistant',content:JSON.stringify({overview:'Returns recovered text.',assumptions:[],predictions:[{inputId:'p1',outcome:{kind:'return',type:'string',valueJson:'"Hello"'},reason:'The existing text is empty.',neededEvidence:'',citations:[{path:'src/response/recovery.js',line:8}]}]})}};};
    const checkedAsk=(input,id)=>engine.handleMessage(input,{memory,sessionId:'checked-pilot',taskId:id,requestId:id,agentId:'alice'});
    const checked=await checkedAsk('Checked analyze src/response/recovery.js function getRecoveryAppend with existingReply set to "" and recoveredReply set to "Hello"','checked-1');
    assert.match(checked.reply,/Experimental deep analysis/);assert.match(checked.reply,/could not be independently checked/);assert(!checked.reply.includes('Returns recovered text'));assert.equal(checkedCalls,0);
    await state.runInSession('checked-pilot',()=>assert.equal(state.projectQuestion.checkedInputs,true));
    const beforeMissing=checkedCalls;
    const beforeClarificationCompleted=completed,beforeClarificationFailed=failed;
    assert.match((await checkedAsk('What does that function do?','checked-2')).reply,/please provide a value for existingReply and recoveredReply/);assert.equal(checkedCalls,beforeMissing);
    assert.equal(completed,beforeClarificationCompleted+1);assert.equal(failed,beforeClarificationFailed);assert.equal(tasks.getTask('checked-2').status,'COMPLETED');
    assert.match(spoken.at(-1),/please provide a value for existingReply and recoveredReply/);
    const liveTest=await checkedAsk('Checked analyze src/diagnostics/checkedAnalysisSample.js function describeValue.','checked-live-1');
    assert.match(liveTest.reply,/please provide a value for value/);assert(!liveTest.reply.includes('could not complete'));
    assert.equal(failed,beforeClarificationFailed);assert.equal(completed,beforeClarificationCompleted+2);assert.equal(tasks.getTask('checked-live-1').status,'COMPLETED');assert.equal(checkedCalls,beforeMissing);
    await state.runInSession('checked-pilot',()=>{assert.equal(state.projectQuestion.checkedInputs,true);assert.equal(state.projectQuestion.targetSymbol,'describeValue');});
    const liveFollowup=await checkedAsk('What does that function return with value set to 7 end input?','checked-live-2');
    assert.match(liveFollowup.reply,/No model interpretation was requested/);assert.equal(checkedCalls,beforeMissing);assert.equal(failed,beforeClarificationFailed);assert.equal(tasks.getTask('checked-live-2').status,'COMPLETED');
    await checkedAsk('Checked analyze src/response/recovery.js function getRecoveryAppend.','checked-return-target');
    assert.match((await checkedAsk('What does that function return with existingReply set to "" and recoveredReply set to "Hello"?','checked-3')).reply,/Experimental deep analysis/);assert.equal(checkedCalls,0);
    const projectCache=require('../src/core/projectCache');
    const oldTree=projectCache.getTree;
    projectCache.getTree=()=>['src/tools/writing/extractKeywords.js','src/utils/keywordExtractor.js'];
    try{
        let calls=0;
        model=async(messages,options)=>{
            calls++;assert.equal(options.think,true);
            const evidence=JSON.parse(messages[1].content.split('SOURCE EVIDENCE:\n')[1]);
            assert.deepEqual(evidence.sources.map(s=>s.path),['src/utils/keywordExtractor.js']);
            return envelope();
        };
        const ask=(input,id)=>engine.handleMessage(input,{memory,sessionId:'deep-choice',taskId:id,requestId:id,agentId:'alice'});
        assert.match((await ask('Deep analyze the keyword extractor file function extract keywords.','choice-1')).reply,/several matching/);
        assert.equal(calls,0);
        await state.runInSession('deep-choice',()=>assert.equal(state.projectQuestion.deepAnalysis,true));
        assert.match((await ask('The one in utils','choice-2')).reply,/Experimental deep analysis/);
        assert.equal(calls,1);
        await state.runInSession('deep-choice',()=>assert.equal(state.projectQuestion.path,'src/utils/keywordExtractor.js'));
        assert.match((await ask('What does that function do to punctuation?','choice-3')).reply,/Experimental deep analysis/);
        assert.equal(calls,2);
    }finally{projectCache.getTree=oldTree;}
    for(const failure of ['citation','transport']){
        const sessionId='deep-failed-'+failure;
        let calls=0;
        model=async messages=>{
            calls++;
            const evidence=JSON.parse(messages[1].content.split('SOURCE EVIDENCE:\n')[1]);
            assert.equal(evidence.sources[0].path,'src/response/recovery.js');
            if(calls===1&&failure==='transport')throw Object.assign(new Error('Local model connection failed.'),{code:'ECONNRESET'});
            return {done:true,done_reason:'stop',message:{role:'assistant',content:JSON.stringify({claims:[{kind:'behavior',text:'Returns the recovered suffix.',assumptions:[],citations:[{path:'src/response/recovery.js',line:calls===1?99999:5}]}],unknowns:[],examples:[]})}};
        };
        const before=completed,beforeFailed=failed;
        const ask=(input,id)=>engine.handleMessage(input,{memory,sessionId,taskId:id,requestId:id,agentId:'alice'});
        const first=await ask('Deep analyze src/response/recovery.js function getRecoveryAppend.',sessionId+'-1');
        assert.match(first.reply,/could not complete/);
        assert.equal(completed,before);assert.equal(failed,beforeFailed+1);
        assert.equal(tasks.getTask(sessionId+'-1').status,'FAILED');
        await state.runInSession(sessionId,()=>{
            assert.equal(state.projectQuestion.path,'src/response/recovery.js');
            assert.equal(state.projectQuestion.targetSymbol,'getRecoveryAppend');
        });
        const next=await ask('What does that function return for [0,false]?',sessionId+'-2');
        assert.match(next.reply,/Experimental deep analysis/);assert.equal(calls,2);
        assert.equal(completed,before+1);
    }
    // A real second message must cancel the first, not hit the global busy guard.
    for (const rapid of [false,true]) {
        spoken=[];stored=[];
        const beforeCompleted=completed,beforeFailed=failed;
        let started,aborted=false;
        const ready=new Promise(resolve=>{started=resolve;});
        model=(messages,options)=>new Promise((resolve,reject)=>{
            options.signal.addEventListener('abort',()=>{aborted=true;setTimeout(()=>reject(new Error('aborted')),20);});
            started();
        });
        const sessionId='interrupt-'+rapid;
        const ask=(text,id)=>engine.handleMessage(text,{memory,sessionId,taskId:id,requestId:id,agentId:'alice'});
        const first=ask('Checked analyze src/diagnostics/checkedAnalysisSample.js function describeValue with value set to 0',sessionId+'-1');
        await ready;
        const second=ask('What does that function do?',sessionId+'-2');
        const third=rapid?ask('What does that function return with value set to 7 end input?',sessionId+'-3'):null;
        assert.equal((await first).reply,'');assert(aborted);
        const result=third?await third:await second;
        if(third)assert.equal((await second).reply,'');
        assert.match(result.reply,rapid?/No model interpretation was requested/:/please provide a value for value/);
        assert.equal(tasks.getTask(sessionId+'-1').status,'CANCELLED');
        assert.equal(completed,beforeCompleted+1);assert.equal(failed,beforeFailed);
        assert.equal(spoken.length,1);assert.equal(stored.filter(e=>e.role==='assistant').length,1);
        await state.runInSession(sessionId,()=>assert.equal(state.projectQuestion.targetSymbol,'describeValue'));
    }
    for(const close of [false,true]){
        spoken=[];stored=[];const before=completed;
        let aborted=false;
        const sessionId=close?'deep-close':'deep-cancel',taskId=close?'deep-3':'deep-2';
        model=(messages,options)=>new Promise((resolve,reject)=>{
            options.signal.addEventListener('abort',()=>{aborted=true;reject(new Error('aborted'));});
            if(close)state.endSession(sessionId);else tasks.cancelTask(taskId);
        });
        const cancelled=await engine.handleMessage(command,{memory,sessionId,taskId,requestId:taskId,agentId:'alice'});
        assert(aborted);assert.equal(cancelled.reply,'');assert.equal(spoken.length,0);
        assert.equal(completed,before);assert(!stored.some(e=>e.role==='assistant'));
        assert.equal(tasks.getTask(taskId).status,'CANCELLED');
    }
    console.log('Conversation deep route: explicit routing, scoped follow-up, task/session cancellation, no late speech or assistant writes passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{Module._load=originalLoad;});
