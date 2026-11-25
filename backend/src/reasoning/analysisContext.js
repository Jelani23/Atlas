// Assemble versioned source relationships for a later reasoning pass. No execution.
const crypto=require('node:crypto');
const VERSION='analysis-context-2';
function buildAnalysisContext(bundle,inventory,rootId,{maxDepth=2,maxNodes=8,maxChars=32000}={}){
    if(!Number.isInteger(maxDepth)||maxDepth<0||maxDepth>4||!Number.isInteger(maxNodes)||maxNodes<1||maxNodes>16||!Number.isInteger(maxChars)||maxChars<2000||maxChars>100000)throw new Error('Invalid analysis context limits.');
    const root=inventory.records.find(r=>r.id===rootId);
    if(!root)throw new Error('Analysis root unavailable.');
    const files=new Map(bundle.files.map(f=>[f.path,f]));
    const manifest=bundle.files.map(f=>({path:f.path,version:f.version})).sort((a,b)=>a.path.localeCompare(b.path));
    const valid=r=>files.get(r.source.path)?.complete&&files.get(r.source.path).version===r.source.version&&r.analyzerVersion===inventory.analyzerVersion&&JSON.stringify(r.provenance.manifest)===JSON.stringify(manifest);
    if(inventory.records.some(r=>!valid(r)))throw new Error('Analysis records must match current complete source and analyzer version.');
    const packet={schema:2,version:VERSION,rootId,nodes:[],sources:[],edges:[],omissions:[],limits:{maxDepth,maxNodes,maxChars},
        evidencePolicy:{
            sourceFacts:'Numbered source snapshots and structural records establish source text and syntax, not observed execution.',
            analyzerLimits:'Unsupported, unresolved completion, coverage gaps and source_expression_not_evaluated describe deterministic capability limits. They do not by themselves establish missing source or prevent reasoning from supplied source.',
            missingInformation:'Check omissions, unresolvedDependencies and source availability separately. A missing helper record does not imply its body is absent from an included source snapshot. Runtime bindings, external state and input values may still require explicit assumptions.',
            modelInference:'Reason from supplied source even beyond analyzer support. Label behavioral predictions and purpose interpretations as MODEL_INFERRED, cite supporting lines and state assumptions. Identify the specific absent evidence for any genuinely unresolved claim. Inference is not execution or verification.',
            executedObservations:'None supplied by this packet.'
        },
        boundary:'Static source relationships. Call arguments are source expressions, not evaluated values. Linked helpers do not establish runtime dispatch, purity, reachability or caller outcomes.'};
    const included=new Set(),queue=[{record:root,depth:0}];
    const fits=()=>JSON.stringify(packet).length<=maxChars-1000;
    const summary=r=>({id:r.id,recordKey:r.cacheKey,name:r.name,source:r.source,parameters:r.parameters,async:r.async,generator:r.generator,conditions:r.conditions,exceptionRegions:r.exceptionRegions,exits:r.exits,inputs:r.inputs,booleanReturn:r.booleanReturn,flowOutline:r.flowOutline,completion:r.completion,coverage:r.coverage});
    while(queue.length){
        const {record,depth}=queue.shift();
        if(included.has(record.id))continue;
        const newSource=!packet.sources.some(s=>s.path===record.source.path);
        if(newSource){const file=files.get(record.source.path);packet.sources.push({path:file.path,version:file.version,complete:true,source:file.source});}
        packet.nodes.push(summary(record));
        if(packet.nodes.length>maxNodes||!fits()){
            packet.nodes.pop();
            if(newSource)packet.sources.pop();
            if(record===root)throw new Error('Root analysis record exceeds context budget.');
            packet.omissions.push({id:record.id,reason:'node_or_character_budget'});continue;
        }
        included.add(record.id);
        for(const call of record.calls){
            const edge={from:record.id,callId:call.id,callee:call.callee,span:call.span,arguments:call.arguments,conditions:call.conditions,regions:call.regions,handlerCandidates:call.handlerCandidates,status:'unresolved',reason:'No supported static binding.'};
            const relation=bundle.facts.find(f=>f.id===call.resolution.evidenceId&&f.rule==='unique-unwritten-top-level-call-binding');
            const targets=relation?.relatedIds.map(id=>bundle.facts.find(f=>f.id===id&&f.kind==='function')).filter(Boolean)||[];
            const target=targets.length===1?inventory.records.find(r=>r.symbolId===targets[0].owner&&r.source.path===targets[0].span.path&&r.source.start===targets[0].span.start):null;
            if(target){
                edge.to=target.id;edge.evidenceId=relation.id;edge.status='statically_linked';delete edge.reason;
                edge.parameterMapping=target.parameters.every(p=>/^[$a-zA-Z_][$\w]*$/.test(p))&&!call.arguments.some(a=>a.startsWith('...'))?target.parameters.map((parameter,i)=>({parameter,argumentExpression:call.arguments[i]??null,status:i<call.arguments.length?'source_expression':'omitted_at_call'})):null;
            }
            packet.edges.push(edge);
            if(!fits()){packet.edges.pop();packet.omissions.push({id:record.id,reason:'remaining_call_edges_exceed_budget'});break;}
            if(target&&!included.has(target.id)){
                if(depth<maxDepth)queue.push({record:target,depth:depth+1});
                else packet.omissions.push({id:target.id,reason:'depth_limit'});
            }
        }
    }
    for(const edge of packet.edges)if(edge.to)edge.targetIncluded=included.has(edge.to);
    packet.omissions=packet.omissions.filter((o,i,a)=>!included.has(o.id)||o.reason==='remaining_call_edges_exceed_budget').filter((o,i,a)=>a.findIndex(x=>x.id===o.id&&x.reason===o.reason)===i);
    // Full manifest deliberately invalidates when any inspected dependency changes.
    packet.manifest=manifest;
    packet.unresolvedDependencies=bundle.dependencies.filter(d=>d.status!=='source_included');
    packet.cacheKey=crypto.createHash('sha256').update(JSON.stringify(packet)).digest('hex');
    if(JSON.stringify(packet).length>maxChars)throw new Error('Analysis context metadata exceeds budget.');
    return packet;
}
module.exports={buildAnalysisContext,VERSION};
