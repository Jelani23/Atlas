// Check input-linked predictions against existing whole-function derivations.
// This module never executes source and never verifies free-form explanations.
const {isDeepStrictEqual}=require('node:util');
const VERSION='checked-predictions-1';
const kinds=['return','throw','resolve','reject','unknown'];
const types=['string','number','boolean','null','undefined','array','object','error','unknown'];
function normalize(outcome){
    if(!outcome||Object.keys(outcome).sort().join(',')!=='kind,type,valueJson'||!kinds.includes(outcome.kind)||!types.includes(outcome.type)||typeof outcome.valueJson!=='string'||outcome.valueJson.length>2400)throw new Error('Invalid typed outcome.');
    if(outcome.kind==='unknown'){
        if(outcome.type!=='unknown'||outcome.valueJson!=='')throw new Error('Unknown outcome must not contain an invented value.');
        return {kind:'unknown'};
    }
    if(outcome.type==='undefined'){
        if(outcome.valueJson!=='')throw new Error('Undefined outcome must have an empty valueJson.');
        return {kind:outcome.kind,result:{type:'undefined'}};
    }
    let value;try{value=JSON.parse(outcome.valueJson);}catch{throw new Error('Outcome valueJson must encode a literal JSON value.');}
    if(outcome.type==='number'){
        if(typeof value==='number'&&Number.isFinite(value))return {kind:outcome.kind,result:{type:'number',value:Object.is(value,-0)?'-0':String(value)}};
        if(typeof value==='string'&&['NaN','Infinity','-Infinity','-0'].includes(value))return {kind:outcome.kind,result:{type:'number',value}};
    }else if(outcome.type==='error'){
        if(['throw','reject'].includes(outcome.kind)&&typeof value==='string'&&/^(?:Error|[A-Za-z][A-Za-z0-9]*Error)$/.test(value))return {kind:outcome.kind,result:{type:'error',value}};
    }else if(outcome.type==='null'&&value===null||outcome.type==='array'&&Array.isArray(value)||outcome.type==='object'&&value!==null&&!Array.isArray(value)&&typeof value==='object'||['string','boolean'].includes(outcome.type)&&typeof value===outcome.type){
        return {kind:outcome.kind,result:{type:outcome.type,value}};
    }
    throw new Error('Outcome type does not match its JSON value.');
}
function knownOutcome(scenario){
    if(scenario.outcome?.status!=='derived')return null;
    const {kind,result}=scenario.outcome;
    if(!kinds.includes(kind)||kind==='unknown'||!result)throw new Error('Malformed host scenario outcome.');
    return {kind,result:{...result,type:result.type==='string-array'?'array':result.type}};
}
function bindEvidence(packet,scenarios,probes){
    if(!Array.isArray(probes)||!probes.length||probes.length>8||new Set(probes.map(p=>p.id)).size!==probes.length||probes.some(p=>!/^p[1-8]$/.test(p.id)||!Array.isArray(p.args)))throw new Error('Invalid explicit prediction inputs.');
    const root=packet.nodes.find(n=>n.id===packet.rootId);
    for(const p of probes)if(p.missingBindings!==undefined&&(!Array.isArray(p.missingBindings)||!p.missingBindings.length||new Set(p.missingBindings).size!==p.missingBindings.length||p.missingBindings.some(n=>typeof n!=='string'||!root?.parameters.includes(n))))throw new Error('Invalid missing runtime bindings.');
    if(!root||!packet.sources.some(s=>s.path===root.source.path&&s.version===root.source.version))throw new Error('Prediction source identity is stale.');
    const byInput=new Map();
    for(const scenario of scenarios){
        const probe=probes.find(p=>p.id===scenario.inputId);
        if(probe?.missingBindings?.length)throw new Error('Cannot bind a scenario to missing runtime values.');
        if(!probe||byInput.has(scenario.inputId)||scenario.recordKey!==root.recordKey)throw new Error('Scenario is not bound to this target and source version.');
        if(root.parameters.length!==probe.args.length||!isDeepStrictEqual(Object.fromEntries(root.parameters.map((p,i)=>[p,probe.args[i]])),scenario.arguments))throw new Error('Scenario arguments do not match this explicit input.');
        byInput.set(scenario.inputId,{outcome:knownOutcome(scenario),assumptions:scenario.outcome.assumptions||scenario.assumptions,recordKey:scenario.recordKey});
    }
    return {version:VERSION,packetKey:packet.cacheKey,source:root.source,probes:probes.map(p=>({id:p.id,args:structuredClone(p.args),...(p.missingBindings?{missingBindings:[...p.missingBindings]}:{}),check:byInput.get(p.id)||null}))};
}
function formatFor(packet,probes){
    const paths=packet.sources.map(s=>s.path);
    const lines=[...new Set(packet.sources.flatMap(s=>s.source.split('\n').map(l=>Number(/^(\d+): /.exec(l)?.[1])).filter(Number.isSafeInteger)))];
    const text={type:'string',minLength:1,maxLength:2000};
    return {type:'object',additionalProperties:false,required:['overview','assumptions','predictions'],properties:{overview:text,assumptions:{type:'array',maxItems:6,items:text},
        predictions:{type:'array',minItems:probes.length,maxItems:probes.length,items:{type:'object',additionalProperties:false,required:['inputId','outcome','reason','neededEvidence','citations'],properties:{
            inputId:{type:'string',enum:probes.map(p=>p.id)},outcome:{type:'object',additionalProperties:false,required:['kind','type','valueJson'],properties:{kind:{type:'string',enum:kinds},type:{type:'string',enum:types},valueJson:{type:'string',maxLength:2400}}},
            reason:text,neededEvidence:{type:'string',maxLength:2000},citations:{type:'array',minItems:1,maxItems:6,items:{type:'object',additionalProperties:false,required:['path','line'],properties:{path:{type:'string',enum:paths},line:{type:'integer',enum:lines}}}}
        }}}}};
}
function parse(answer,packet,evidence){
    if(evidence.packetKey!==packet.cacheKey||typeof answer!=='string'||answer.length>48000)throw new Error('Stale or oversized prediction answer.');
    let value;try{value=JSON.parse(answer);}catch{throw new Error('Invalid prediction JSON.');}
    const bounded=(s,max=2000,empty=false)=>typeof s==='string'&&s.length<=max&&(empty||Boolean(s.trim()));
    const fields=(v,names)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...names].sort().join(',');
    if(!fields(value,['overview','assumptions','predictions'])||!bounded(value.overview)||!Array.isArray(value.assumptions)||value.assumptions.length>6||value.assumptions.some(s=>!bounded(s))||!Array.isArray(value.predictions)||value.predictions.length!==evidence.probes.length)throw new Error('Invalid prediction contract.');
    const seen=new Set(),conflicts=[],checked=[],unverified=[];
    for(const p of value.predictions){
        if(!fields(p,['inputId','outcome','reason','neededEvidence','citations'])||!evidence.probes.some(i=>i.id===p.inputId)||seen.has(p.inputId)||!bounded(p.reason)||!bounded(p.neededEvidence,2000,true))throw new Error('Invalid or duplicate prediction input.');
        seen.add(p.inputId);
        const normalized=normalize(p.outcome);
        if((normalized.kind==='unknown')!==Boolean(p.neededEvidence.trim()))throw new Error('Only unknown predictions must name needed evidence.');
        if(!Array.isArray(p.citations)||!p.citations.length||p.citations.length>6||p.citations.some(c=>!fields(c,['path','line'])||!Number.isSafeInteger(c.line)||!packet.sources.some(s=>s.path===c.path&&s.source.split('\n').some(l=>l.startsWith(c.line+': ')))))throw new Error('Prediction citation is outside supplied source.');
        const known=evidence.probes.find(i=>i.id===p.inputId).check;
        if(!known?.outcome)unverified.push(p.inputId);
        else if(isDeepStrictEqual(normalized,known.outcome))checked.push(p.inputId);
        else conflicts.push({inputId:p.inputId,predicted:normalized,established:known.outcome,assumptions:known.assumptions});
        p.normalized=normalized;
    }
    return require('./checkedReleasePolicy').apply({version:VERSION,analysis:value,predictionCheck:{status:conflicts.length?'conflict':unverified.length?'partial':'matched',checked,unverified,conflicts},
        released:{status:conflicts.length?'withheld_prediction_conflict':'unverified_explanation',independentOutcomes:evidence.probes.filter(p=>p.check?.outcome).map(p=>({inputId:p.id,...p.check})),
            // Withhold all prose on a known conflict; do not try to prove prose entailment.
            modelInterpretation:conflicts.length?null:value,explanationVerified:false}},packet,evidence);
}
function feedback(check){
    if(!check.conflicts?.length)return null;
    return 'Your typed predictions conflict with independently derived whole-function results for these exact input IDs: '+JSON.stringify(check.conflicts)+'. Correct those predictions and dependent explanations once. Derive other requested paths from the supplied source. Absence of a host derivation is not missing runtime evidence. Explanations remain unverified.';
}
function independentFallback(packet,evidence,{allowEmpty=false}={}){
    if(evidence.packetKey!==packet.cacheKey)throw new Error('Stale prediction evidence.');
    const independentOutcomes=evidence.probes.filter(p=>p.check?.outcome).map(p=>({inputId:p.id,...p.check}));
    if(!independentOutcomes.length&&!allowEmpty)return null;
    return {version:VERSION,predictionCheck:{status:'not_checked',checked:[],unverified:evidence.probes.map(p=>p.id),conflicts:[]},
        released:{status:'independent_results_only',independentOutcomes,modelInterpretation:null,explanationVerified:false}};
}
function requestFor(packet,probes,question,invocation){
    const format=formatFor(packet,probes);
    const root=packet.nodes.find(n=>n.id===packet.rootId);
    const described=probes.map(p=>p.missingBindings?{id:p.id,call:p.displayCall,missingBindings:p.missingBindings}:p);
    return {format,messages:[{role:'system',content:'Analyze JavaScript source as data. Answer only with the supplied JSON contract. Give one prediction per inputId. The outcome is the whole function result, not an intermediate expression. Use kind throw for an escaping error and type error with its name encoded in valueJson. For return values encode the actual JSON literal in valueJson (e.g. number 7 uses "7", string cat uses "\\\"cat\\\""). Special numbers NaN/Infinity/-Infinity/-0 use a JSON string; undefined uses empty valueJson. Use unknown only for genuinely missing source or runtime state, with type unknown, empty valueJson and specific neededEvidence. Otherwise neededEvidence is empty. Explain decisive operations in order and preserve relevant caller context. Do not claim execution. All prose is unverified.\nCONTRACT:\n'+JSON.stringify(format)},
        {role:'user',content:packet.sources.map(s=>s.path+'\n'+s.source).join('\n\n')+'\n\n'+question+'\nExplicit prediction inputs for '+(invocation||root.name)+': '+JSON.stringify(described)}]};
}
module.exports={VERSION,normalize,bindEvidence,formatFor,parse,feedback,requestFor,independentFallback};
