const {readRange}=require('../core/sourceReader');
const {getDefaultModel}=require('../models/modelRouter');
const contract=require('./deepAnalysisContract');
const {inspectResponse}=require('./deepAnalysisResponse');
let active=false;
const policy=Object.freeze({think:true,temperature:0,maxTokens:12000,context:16384,timeoutMs:600000});
function createService({read=readRange,timeoutMs=policy.timeoutMs,encoded=false,checkedInputs=false}={}){
    return {async answer({filename,question,targetSymbol,contextQuestion},{agentId,completeEnvelope,isCancelled=()=>false,requestId,onSourceSelected=()=>{}}){
        if(!/^[a-z][a-z0-9_-]{0,63}$/.test(agentId)||typeof question!=='string'||!question.trim()||question.length>3000)throw new Error('Invalid deep analysis request.');
        if(typeof completeEnvelope!=='function')throw new Error('Deep analysis requires local completion metadata.');
        if(active)throw new Error('A deep analysis is already running. Please wait for it to finish.');
        active=true;
        const started=Date.now();
        let pending,timer,poll;
        const controller=new AbortController();
        const check=()=>{if(isCancelled())throw new Error('Deep analysis cancelled.');};
        try{
            check();
            const built=await require('./sourceBundle').buildBundle(await read(filename,1,200),{read,maxChars:48000,cancelled:check});
            const requested=contextQuestion&&targetSymbol?targetSymbol:/\bfunction\s+(.+?)(?=\s+with\b|[?.!]|$)/i.exec(question)?.[1]||targetSymbol;
            const target=require('./spokenAnalysis').selectTarget(built.bundle,requested);
            const inventory=require('./functionBehavior').buildFunctionRecords(built.bundle);
            const roots=inventory.records.filter(r=>r.source.path===built.bundle.files[0].path&&r.name===target);
            if(roots.length!==1)throw new Error('Select one unique function for deep analysis.');
            const packet=require('./analysisContext').buildAnalysisContext(built.bundle,inventory,roots[0].id,{maxChars:48000});
            await built.assertCurrent();check();
            onSourceSelected({path:roots[0].source.path,targetSymbol:target});
            const prepared=checkedInputs?require('./checkedAnalysisInputs').prepare(built.bundle,roots[0],packet,question):null;
            if(checkedInputs&&!prepared){
                await built.assertCurrent();check();
                const parameters=roots[0].parameters;
                return {reply:'To check '+target+', please provide a value for '+parameters.join(' and ')+'. Use: Checked analyze '+roots[0].source.path+' function '+target+' with '+parameters.map(p=>p+' set to <value>').join(' and ')+'.',
                    speech:'To check '+target+', please provide a value for '+parameters.join(' and ')+'.',
                    path:roots[0].source.path,version:roots[0].source.version,packet,
                    clarification:{kind:'parameter_values',parameters},modelSkipped:'needs_parameter_values',
                    integrity:{status:'not_requested'},coverage:{target:{name:target}},deepAnalysis:true,checkedInputs:true};
            }
            const messages=prepared?prepared.request.messages:contract.messages(packet,question,{encoded,contextQuestion});
            // Current local protocol cannot reliably distinguish quoted delimiters from channel control.
            // Keep the original evidence intact; do not "repair" it or the resulting model answer.
            if(/<\/?(?:think|tool_call)>/i.test(JSON.stringify({packet,question,contextQuestion})))throw new Error('Deep analysis is unavailable for source or questions containing model channel tags on this local provider. The source is intact; use ordinary Analyze for now.');
            await built.assertCurrent();check();
            if(prepared&&prepared.evidence.probes.some(p=>!p.check?.outcome)){
                const checked=require('./checkedPredictions').independentFallback(packet,prepared.evidence,{allowEmpty:true});
                checked.released.status='not_requested_unsupported';
                return {...require('./checkedAnalysisResponse').render(checked,prepared,packet),path:roots[0].source.path,version:roots[0].source.version,
                    packet,analysis:{status:checked.released.status,...checked.released},predictionCheck:checked.predictionCheck,
                    modelSkipped:'unsupported_outcome',integrity:{status:'not_requested'},coverage:{target:{name:target}},deepAnalysis:true,checkedInputs:true};
            }
            const deadline=Date.now()+timeoutMs;
            const fallback=async(error,reason,integrity)=>{
                if(!prepared)throw error;
                check();await built.assertCurrent();check();
                const checked=require('./checkedPredictions').independentFallback(packet,prepared.evidence,{allowEmpty:true});
                if(!checked)throw error;
                return {...require('./checkedAnalysisResponse').render(checked,prepared,packet,{modelFailure:true}),
                    path:roots[0].source.path,version:roots[0].source.version,packet,
                    analysis:{status:checked.released.status,...checked.released},predictionCheck:checked.predictionCheck,
                    modelFailure:reason,integrity:integrity?{...integrity,answer:undefined}:{status:'unavailable',issues:['local_completion_failed']},
                    coverage:{target:{name:target}},deepAnalysis:true,checkedInputs:true};
            };
            const invoke=async history=>{
                const remaining=deadline-Date.now();
                if(remaining<=0)throw new Error('Deep analysis timed out.');
                pending=Promise.resolve().then(()=>completeEnvelope(history,{
                    ...getDefaultModel(),...policy,timeoutMs:remaining,requestId,format:prepared?prepared.request.format:contract.formatFor(packet),signal:controller.signal
                }));
                try{return await Promise.race([pending,new Promise((_,reject)=>{
                    timer=setTimeout(()=>{controller.abort();reject(new Error('Deep analysis timed out.'));},remaining);
                    poll=setInterval(()=>{if(isCancelled()){controller.abort();reject(new Error('Deep analysis cancelled.'));}},50);
                })]);}finally{clearTimeout(timer);clearInterval(poll);}
            };
            let data;
            try{data=await invoke(messages);}catch(error){return await fallback(error,'transport_failed');}
            check();await built.assertCurrent();check();
            const integrity=inspectResponse(data);
            if(integrity.status!=='complete'){
                console.info('[DeepAnalysis]',JSON.stringify({requestId,issues:integrity.issues}));
                return await fallback(new Error('Deep analysis is incomplete: the model did not return a usable final answer.'),'incomplete',integrity);
            }
            if(integrity.warnings.length)return await fallback(new Error('Deep analysis withheld because the final answer may contain channel control text or drafting.'),'channel_warning',integrity);
            if(prepared){
                const checker=require('./checkedPredictions');
                let checked,correctionFailed=false;
                try{checked=checker.parse(integrity.answer,packet,prepared.evidence);}catch(error){return await fallback(error,'invalid_contract',integrity);}
                const firstCheck=checked.predictionCheck;
                let correctionIntegrity;
                if(firstCheck.conflicts.length){
                    check();await built.assertCurrent();check();
                    try{
                        correctionIntegrity=inspectResponse(await invoke([...messages,{role:'assistant',content:integrity.answer},{role:'user',content:checker.feedback(firstCheck)}]));
                        if(correctionIntegrity.status!=='complete'||correctionIntegrity.warnings.length)throw new Error('Incomplete correction.');
                        checked=checker.parse(correctionIntegrity.answer,packet,prepared.evidence);
                    }catch{correctionFailed=true;}
                    check();await built.assertCurrent();check();
                }
                checked=require('./checkedReleasePolicy').requireCheckedOutcomes(checked);
                const rendered=require('./checkedAnalysisResponse').render(checked,prepared,packet,{correctionFailed});
                return {...rendered,path:roots[0].source.path,version:roots[0].source.version,analysis:{status:checked.released.status,...checked.released},packet,
                    predictionCheck:checked.predictionCheck,firstPredictionCheck:firstCheck,correctionFailed,
                    integrity:{...integrity,answer:undefined},correctionIntegrity:correctionIntegrity?{...correctionIntegrity,answer:undefined}:undefined,
                    coverage:{target:{name:target}},deepAnalysis:true,checkedInputs:true};
            }
            const analysis=contract.parse(integrity.answer,packet);
            const cite=c=>c.citations.map(r=>r.path+':'+r.line).join(', ');
            const literal=value=>value.trim()?value:JSON.stringify(value);
            const analyzerLimits=[...new Set(packet.nodes.flatMap(n=>n.coverage?.gaps||[]))];
            const sourceGaps=packet.unresolvedDependencies.map(d=>d.specifier+': '+d.reason);
            const evidenceSummary='Source evidence: selected '+target+' at '+roots[0].source.path+':'+roots[0].source.line+'. Complete snapshots supplied: '+packet.sources.map(s=>s.path).join(', ')+'.\n'+
                'Deterministic analyzer limits: '+(contextQuestion?analyzerLimits.length+' recorded; these do not by themselves prevent reasoning from the supplied source.':analyzerLimits.join(' ')||'No additional limitations recorded.')+'\n'+
                'Recorded dependency source gaps: '+(sourceGaps.join('; ')||'none within the inspected scope')+'.\n'+
                'Omitted analysis records or edges: '+(packet.omissions.map(o=>o.id+' ('+o.reason+')').join('; ')||'none')+'. An omitted record does not necessarily mean its source text is absent.';
            const reply='Experimental deep analysis — model interpretations, not independently verified.\n\nModel interpretations:\n'+
                analysis.claims.map(c=>c.text+(c.assumptions.length?'\nAssumptions: '+c.assumptions.join('; '):'')+'\nSource: '+cite(c)).join('\n\n')+
                (analysis.examples.length?'\n\nPredicted examples (not executed):\n'+analysis.examples.map(e=>literal(e.input)+' → '+literal(e.predictedOutcome)+'. '+e.reason+'\nSource: '+cite(e)).join('\n\n'):'')+
                (analysis.unknowns.length?'\n\nModel-proposed open questions (not established source gaps):\n'+analysis.unknowns.map(u=>u.kind+': '+u.detail+'\nBlocked conclusion: '+u.blockedConclusion+'\nNeeded: '+u.neededEvidence).join('\n\n'):'')+
                '\n\nEvidence notes:\n'+evidenceSummary+
                '\n\nNo tests run or project knowledge saved.';
            const spokenClaims=analysis.claims.slice(0,5);
            const assumptions=[...new Set(spokenClaims.flatMap(c=>c.assumptions))];
            let speech='This is an experimental reading of the code, not a verified result. '+spokenClaims.map(c=>c.text).join(' ')+
                (assumptions.length?' This reading assumes: '+assumptions.join('; ')+'.':'')+
                (analysis.claims.length>5||analysis.examples.length?' The detailed analysis and predicted examples are on screen.':'')+
                (analysis.unknowns.length?' The model also proposes open questions on screen; these have not been verified.':'');
            for(const source of packet.sources)speech=speech.split(source.path).join(source.path.split('/').pop().replace(/\.js$/,'').replace(/([a-z0-9])([A-Z])/g,'$1 $2')+' file');
            return {reply,speech,path:roots[0].source.path,version:roots[0].source.version,analysis,packet,integrity:{...integrity,answer:undefined},coverage:{target:{name:target}},deepAnalysis:true};
        }catch(error){
            console.info('[DeepAnalysis]',JSON.stringify({requestId,status:'failed',code:error.code||error.cause?.code||'DEEP_ANALYSIS_REJECTED',citationIssue:error.citationIssue}));
            throw error;
        }finally{
            clearTimeout(timer);clearInterval(poll);
            console.info('[ProjectQuestion]',JSON.stringify({requestId,stage:'deep_model',elapsedMs:Date.now()-started,aborted:controller.signal.aborted}));
            // An aborted provider that ignores its signal must not overlap a later local call.
            if(pending){
                const released=pending.then(()=>{active=false;},()=>{active=false;});
                if(controller.signal.aborted){
                    // HTTP abort errors arrive asynchronously. Allow transport cleanup
                    // before a replacement turn, but retain the lock if it ignores abort.
                    let cleanupTimer;
                    try{await Promise.race([released,new Promise(resolve=>{cleanupTimer=setTimeout(resolve,250);})]);}
                    finally{clearTimeout(cleanupTimer);}
                }
            }else active=false;
        }
    }};
}
module.exports={createService,policy};
