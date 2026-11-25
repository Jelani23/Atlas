// Evaluation-only claim checks. Conditional branch facts never prove reachability.
const h=require('./harness'),checker=require('../../src/reasoning/checkedPredictions');
async function prepare(e,{allowUnsupported=false}={}){
 const s=e.packet.sources[0];
 const {bundle}=await require('../../src/reasoning/sourceBundle').buildBundle({path:s.path,version:s.version,text:s.source,complete:true},{read:async()=>{throw new Error('Unexpected dependency read.');}});
 const scoped=require('../../src/reasoning/symbolScope').scopeBundle(bundle,e.plan.target);
 scoped.facts.push(...e.checks.facts);
 const facts=require('../../src/reasoning/branchConclusions').deriveBranchConclusions(scoped);
 if(!facts.length&&!allowUnsupported)throw new Error('No supported conditional branch claims.');
 return {packetKey:e.packet.cacheKey,inputKey:h.hash(e.probes),facts};
}
function request(e,bound,{errorEncodingExample=false,sourceBoundaryRule=false}={}){
 checkBinding(e,bound);
 const r=checker.requestFor(e.packet,e.probes,e.question,e.plan.invocation);
 if(sourceBoundaryRule)r.messages[0].content=r.messages[0].content.replace('\nCONTRACT:', '\nMissing source or an unprovided runtime binding limits what you know; it does not establish that a value is undefined, an export is absent, or a module cannot load. Do not infer a fixed exception from omitted code alone. When a requested outcome depends on that missing evidence, use unknown, name the needed evidence, and explain only the operations established by supplied source.\nCONTRACT:');
 if(!bound.facts.length)return encodingExample(r,errorEncodingExample);
 r.format.required.push('conditionClaims');
 r.format.properties.conditionClaims={type:'array',minItems:bound.facts.length,maxItems:bound.facts.length,items:{type:'object',additionalProperties:false,required:['factId','conditionValue','selectedBranch'],properties:{factId:{type:'string',enum:bound.facts.map(f=>f.id)},conditionValue:{type:'boolean'},selectedBranch:{type:'string',enum:['then','else','fallthrough']}}}};
 // Rebuild the embedded schema so it agrees with the provider contract.
 r.messages[0].content=r.messages[0].content.split('\nCONTRACT:')[0]+'\nAlso predict conditionClaims for each requested source condition under its input binding. conditionValue is the boolean result if reached; selectedBranch is then, else, or fallthrough if reached. These claims do not establish reachability or final outcomes. Keep explanation and outcome consistent with your claims.\nCONTRACT:\n'+JSON.stringify(r.format);
 r.messages[1].content+='\nCondition queries (answers withheld): '+JSON.stringify(bound.facts.map(f=>({factId:f.id,inputId:f.inputId,parameter:f.parameter,condition:f.conditionText,path:f.span.path,line:f.span.line})));
 return encodingExample(r,errorEncodingExample);
}
function encodingExample(r,enabled){
 if(enabled)r.messages[0].content+='\nEncoding example only, unrelated to these inputs: an escaping RangeError is represented as '+JSON.stringify({kind:'throw',type:'error',valueJson:JSON.stringify('RangeError')})+'. The error name inside valueJson must itself be a JSON string literal, including its quotation marks.';
 return r;
}
function checkBinding(e,bound){if(bound.packetKey!==e.packet.cacheKey||bound.inputKey!==h.hash(e.probes))throw new Error('Stale source or input binding.');}
function inspect(answer,e,bound){
 return inspectClaims(answer,e,bound);
}
function inspectClaims(answer,e,bound){
 checkBinding(e,bound);
 if(!bound.facts.length){
  const parsed=h.inspectStructured(answer,e,'D');
  return {...parsed,conditionCheck:{status:'not_supported',conflicts:[]},released:{...(parsed.released||{status:'withheld_invalid_contract',modelInterpretation:null}),explanationVerified:false}};
 }
 const value=JSON.parse(answer),claims=value.conditionClaims;delete value.conditionClaims;
 if(!Array.isArray(claims)||claims.length!==bound.facts.length)throw new Error('Every condition claim is required.');
 const seen=new Set(),conflicts=[];
 for(const claim of claims){
  const fact=bound.facts.find(f=>f.id===claim?.factId);
  if(!fact||seen.has(claim.factId)||Object.keys(claim).sort().join(',')!=='conditionValue,factId,selectedBranch'||typeof claim.conditionValue!=='boolean'||!['then','else','fallthrough'].includes(claim.selectedBranch))throw new Error('Malformed or duplicate condition claim.');
  seen.add(claim.factId);
  if(claim.conditionValue!==fact.conditionValue||claim.selectedBranch!==fact.selectedBranch)conflicts.push({factId:fact.id,inputId:fact.inputId,condition:fact.conditionText,predicted:claim,established:{conditionValue:fact.conditionValue,selectedBranch:fact.selectedBranch},source:{path:fact.span.path,line:fact.span.line},assumptions:fact.assumptions});
 }
 const conditionCheck={status:conflicts.length?'conflict':'matched',conflicts};
 let parsed;
 try{parsed=checker.parse(JSON.stringify(value),e.packet,checker.bindEvidence(e.packet,e.checks.scenarios,e.probes));}
 catch(error){return {contractStatus:'invalid',error:error.message,conditionCheck,released:{status:'withheld_invalid_contract',modelInterpretation:null,explanationVerified:false}};}
 return {contractStatus:'valid',...parsed,conditionCheck,released:{...parsed.released,...(conflicts.length?{status:'withheld_condition_conflict',modelInterpretation:null}:{}),explanationVerified:false}};
}
function feedback(result){
 const conflicts=result.conditionCheck.conflicts;
 if(!conflicts.length)return null;
 return 'These predicted condition claims conflict with independently derived, input-bound facts: '+JSON.stringify(conflicts)+'. Revise the claims and dependent outcomes/explanations once. Each fact is conditional on reaching that expression with the recorded input; it does not prove reachability or a whole-function result. Derive unsupported outcomes from source without inventing missing state.';
}
module.exports={prepare,request,inspect,feedback};
