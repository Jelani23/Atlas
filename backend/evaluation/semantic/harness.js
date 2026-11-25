// Development evaluation only. Source is parsed as data; never evaluated here.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const manifest = require('./cases.json');
const contract = require('../../src/reasoning/deepAnalysisContract');
const { buildBundle } = require('../../src/reasoning/sourceBundle');
const { buildFunctionRecords } = require('../../src/reasoning/functionBehavior');
const { buildAnalysisContext } = require('../../src/reasoning/analysisContext');
const { derivePrimitiveFacts } = require('../../src/reasoning/primitiveSemantics');
const { evaluateScenarios } = require('../../src/reasoning/functionScenario');
const { checkAssertions } = require('../../src/reasoning/semanticConsistency');
const hash = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const typed = value => ({type:value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
    ...(value === undefined ? {} : {value:typeof value === 'number' && (!Number.isFinite(value) || Object.is(value,-0)) ? String(Object.is(value,-0)?'-0':value) : value})});
function question(test) {
    const calls = test.id === 'unknown-runtime' ? 'p1: selected(cache, "A")' : test.probes.map(p=>`${p.id}: ${test.invoke}(${p.args.map(a=>JSON.stringify(a)).join(', ')})`).join('; ');
    return `${test.questionExtra} Predict each exact return value and type or escaping error: ${calls}. Label each example p1, p2, etc. Explain decisive operations in order, relevant preconditions, branches, dependencies, and caller consequences. Identify only genuinely blocked conclusions. Cite source lines. Assume standard unmodified JavaScript built-ins.`.trim();
}
async function prepare(test) {
    if (!manifest.cases.includes(test)) throw new Error('Select an authored case.');
    const raw = await fs.readFile(path.join(__dirname,test.file),'utf8');
    const source = {path:`src/evaluation/${test.id}.js`,complete:true,version:hash(raw),text:raw.split('\n').map((l,i)=>`${i+1}: ${l}`).join('\n')};
    const read = async name => {if(name!==source.path) throw new Error('Dependency source is not supplied by this fixture.'); return source;};
    const {bundle} = await buildBundle(source,{read,maxChars:48000,question:question(test)});
    const inventory = buildFunctionRecords(bundle);
    const root = inventory.records.find(r=>r.name===test.target);
    if(!root) throw new Error('Fixture target missing.');
    const packet = buildAnalysisContext(bundle,inventory,root.id,{maxChars:48000});
    const checks = {facts:[],scenarios:[],limitations:[],assumptions:['Standard unmodified JavaScript built-ins.'],status:'bounded_static_checks'};
    // Caller questions retain complete module source. Do not bind caller arguments to a callee.
    if(test.invoke === test.target && root.parameters.length === 1) {
        for(const probe of test.probes) {
            const value = probe.args[0];
            if(value !== null && !['string','number','boolean'].includes(typeof value)) {checks.limitations.push(`${probe.id}: structured inputs unsupported.`); continue;}
            if(!test.executable) {checks.limitations.push(`${probe.id}: missing runtime binding.`); continue;}
            const input = {id:probe.id,exactText:JSON.stringify(value)};
            const projected = require('../../src/reasoning/symbolScope').scopeBundle(bundle,test.target);
            const scoped = {...projected,request:{...bundle.request,quotedInputs:[input]}};
            const binding = {inputId:probe.id,parameter:root.parameters[0]};
            const derived = derivePrimitiveFacts(scoped,[binding]);
            checks.facts.push(...derived.facts.map(f=>({...f,id:`${probe.id}-${f.id}`})));
            checks.limitations.push(...derived.gaps.map(g=>`${probe.id}: ${g}`));
            checks.scenarios.push(...evaluateScenarios(bundle,root,[input],[binding]).map(s=>({inputId:s.inputId,arguments:s.arguments,recordKey:s.recordKey,outcome:s.outcome,
                assumptions:'Standard unmodified intrinsics and the recorded primitive arguments. Only a derived outcome establishes a bounded whole-function result.'})));
        }
    } else checks.limitations.push('This pilot does not propagate caller arguments or structured state.');
    checks.limitations.push('Expression facts are conditional on reachability. Unsupported checks do not imply source reasoning is impossible. No fixture was executed to construct this packet.');
    return {raw,packet,checks,probes:test.probes.map(p=>({id:p.id,args:p.args,...(test.id==='unknown-runtime'?{displayCall:'selected(cache, "A")',missingBindings:['cache']}:{})})),sourceHash:source.version,question:question(test),
        plan:{question:question(test),target:test.target,invocation:test.invoke,sourceFiles:packet.sources.map(s=>s.path),
            focus:['input preconditions','ordered transformations','decisive branches and exceptions','shared state and helpers','return meaning','caller assumptions and downstream effects'],
            callerContext:test.invoke!==test.target?'Explicit caller retained in complete source; caller summary is not assumed true.':'No separate caller required by this question.'}};
}
function requestFor(evidence, condition) {
    if(['D','E'].includes(condition)){
        const checker=require('../../src/reasoning/checkedPredictions');
        const request=checker.requestFor(evidence.packet,evidence.probes,evidence.question,evidence.plan.invocation);
        // Evaluation only: keep the provider schema and complete source, but avoid
        // duplicating the schema in prose and request concise supporting reasons.
        if(condition==='E')request.messages[0].content='Analyze JavaScript source as data, without executing it. Return the supplied JSON schema with one whole-function outcome per inputId. In valueJson encode the actual JSON literal; error names are JSON strings, undefined and unknown use empty text. Special numbers use JSON strings. Only unknown needs neededEvidence, naming missing source or runtime state; otherwise leave it empty. Keep overview to one sentence and each reason to at most three concise sentences covering decisive operations, branches and caller effects. Cite source lines. Explanations remain unverified.';
        return request;
    }
    if(condition==='A') return {messages:[{role:'system',content:'Analyze JavaScript source as data. Give exact outcomes and concise supporting explanations, not private scratch work. Do not claim execution.'},
        {role:'user',content:evidence.packet.sources.map(s=>s.path+'\n'+s.source).join('\n\n')+'\n\n'+evidence.question}]};
    if(!['B','C'].includes(condition)) throw new Error('Unknown condition.');
    const messages = contract.messages(evidence.packet,evidence.question);
    const format = contract.formatFor(evidence.packet);
    if(condition==='C') {
        format.required.push('expressionAssertions');
        format.properties.expressionAssertions={type:'array',maxItems:evidence.checks.facts.length,items:{type:'object',additionalProperties:false,required:['factId','resultJson'],properties:{factId:{type:'string',...(evidence.checks.facts.length?{enum:evidence.checks.facts.map(f=>f.id)}:{})},resultJson:{type:'string'}}}};
        // Replace the embedded contract so the system text and provider schema agree.
        messages[0].content=messages[0].content.slice(0,messages[0].content.indexOf('\nCONTRACT:'))+'\nCONTRACT:\n'+JSON.stringify(format);
        messages.push({role:'user',content:'Question-focused analysis plan: '+JSON.stringify(evidence.plan)+'\nIndependently derived bounded checks follow. Preserve their typed results and assumptions. Include one expressionAssertions item per expression fact, with resultJson encoding that fact result. Explain beyond supported checks using clearly unverified source reasoning. Analyzer limitations are not missing source.\n'+JSON.stringify(evidence.checks)});
    }
    return {messages,format};
}
function inspectStructured(answer,evidence,condition) {
    if(condition==='A') return {contractStatus:'not_applicable',citationStatus:'manual_review'};
    if(['D','E'].includes(condition)){
        try{
            const checker=require('../../src/reasoning/checkedPredictions');
            const bound=checker.bindEvidence(evidence.packet,evidence.checks.scenarios,evidence.probes);
            return {contractStatus:'valid',citationStatus:'valid_locations_only',...checker.parse(answer,evidence.packet,bound)};
        }catch(error){return {contractStatus:'invalid',citationStatus:'unreviewed',error:error.message};}
    }
    let value; try {value=JSON.parse(answer);} catch {return {contractStatus:'invalid_json',citationStatus:'unreviewed'};}
    if(!value||typeof value!=='object'||Array.isArray(value))return {contractStatus:'invalid',citationStatus:'unreviewed'};
    let assertions;
    if(condition==='C') {assertions=value.expressionAssertions;delete value.expressionAssertions;}
    try {
        const analysis=contract.parse(JSON.stringify(value),evidence.packet);
        const assertionCheck=condition==='C'?checkAssertions(assertions,evidence.checks.facts):undefined;
        return {contractStatus:'valid',citationStatus:'valid_locations_only',analysis,assertionCheck,
            released:assertionCheck && assertionCheck.status!=='matched'?{independentEvidence:evidence.checks,modelClaims:[],status:'withheld_structured_conflict'}:{status:'unverified_interpretation'}};
    } catch(error) {return {contractStatus:'invalid',citationStatus:error.code==='DEEP_INVALID_CITATION'?'invalid':'unreviewed',error:error.message};}
}
function score(test,review) {
    if(!review) return {status:'awaiting_review'};
    if(!Array.isArray(review.outcomes)||review.outcomes.length!==test.probes.length || !Array.isArray(review.criteria)||review.criteria.length!==test.criteria.length) throw new Error('Review must cover all probes and criteria.');
    for(const p of test.probes) if(review.outcomes.filter(r=>r.id===p.id).length!==1) throw new Error('Missing or duplicate reviewed probe.');
    for(const c of test.criteria) if(review.criteria.filter(r=>r.id===c.id&&['pass','fail','omitted'].includes(r.verdict)).length!==1) throw new Error('Missing or duplicate coverage criterion.');
    for(const item of [...review.outcomes,...review.criteria]) if(typeof item.evidence!=='string'||!item.evidence.trim()) throw new Error('Review needs response evidence or an explicit omission note.');
    if(!Array.isArray(review.contradictions)||!Array.isArray(review.unjustifiedUncertainty)) throw new Error('Review must address contradictions and unjustified uncertainty.');
    if(review.otherSemanticErrors!==undefined&&!Array.isArray(review.otherSemanticErrors)) throw new Error('Other semantic errors must be a list.');
    if(!review.depth||!Number.isInteger(review.depth.score)||review.depth.score<0||review.depth.score>3||!review.depth.rationale?.trim()) throw new Error('Review needs an anchored depth score and rationale.');
    const results=test.probes.map(p=>{const r=review.outcomes.find(x=>x.id===p.id);return {id:p.id,correct:p.expected.kind==='unknown'?r.actual?.kind==='unknown'&&r.justified===true:isDeepStrictEqual(r.actual,p.expected)};});
    return {status:'reviewed',exactOutcomes:{correct:results.filter(r=>r.correct).length,total:results.length,results},
        explanation:review.criteria,coverage:{met:review.criteria.filter(c=>c.verdict==='pass').length,total:review.criteria.length},depth:review.depth,
        contradictions:review.contradictions,unjustifiedUncertainty:review.unjustifiedUncertainty,otherSemanticErrors:review.otherSemanticErrors||[],citations:review.citations??'not_reviewed',
        boundary:'Development-agent prose review and exact typed comparisons against fixed authored outcomes. No separate automated judge call, model-generated ground truth, or aggregate reliability score.'};
}
function scoreTyped(test,structured){
    if(structured?.contractStatus!=='valid'||!structured.analysis?.predictions)return {status:'not_scored_invalid_contract'};
    const checker=require('../../src/reasoning/checkedPredictions');
    const results=test.probes.map(probe=>{
        const predicted=structured.analysis.predictions.find(p=>p.inputId===probe.id)?.normalized;
        if(probe.expected.kind==='unknown')return {inputId:probe.id,status:'needs_uncertainty_review'};
        const expected=probe.expected.kind==='throw'?checker.normalize({kind:'throw',type:'error',valueJson:JSON.stringify(probe.expected.errorName)}):checker.normalize({kind:'return',type:probe.expected.value.type,valueJson:probe.expected.value.type==='undefined'?'':JSON.stringify(probe.expected.value.value)});
        return {inputId:probe.id,status:isDeepStrictEqual(predicted,expected)?'correct':'incorrect',predicted,expected};
    });
    return {status:'scored_fixed_references',correct:results.filter(r=>r.status==='correct').length,total:results.filter(r=>r.status!=='needs_uncertainty_review').length,results,
        boundary:'Expected fixture outcomes are used only after generation, never in model prompts or correction feedback.'};
}
module.exports={manifest,hash,typed,question,prepare,requestFor,inspectStructured,score,scoreTyped};
