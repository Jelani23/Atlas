// Presentation for the bounded prediction pilot. Matching values never certify prose.
function render(checked,prepared,packet,{correctionFailed=false,modelFailure=false}={}){
    const show=value=>value.type==='undefined'?'undefined':value.type==='number'?value.value:JSON.stringify(value.value);
    const input=id=>{const p=prepared.probes.find(p=>p.id===id);return p?.displayCall||JSON.stringify(p?.args);};
    const independent=checked.released.independentOutcomes;
    const known=independent.map(p=>input(p.inputId)+' → '+p.outcome.kind+' '+show(p.outcome.result)+' ('+p.outcome.result.type+').\nAssumptions: '+JSON.stringify(p.assumptions||'Recorded primitive arguments and standard unmodified built-ins.'));
    const analysis=checked.released.modelInterpretation;
    const status=checked.released.status;
    const withheld=modelFailure?'The local model did not provide a usable explanation.':
        status==='not_requested_unsupported'?'No model interpretation was requested: at least one requested outcome could not be independently checked.':
        status==='withheld_unchecked_outcome'?'Model interpretation withheld: at least one requested outcome could not be independently checked.':
        status==='withheld_unverified_dependency'?'Model interpretation withheld: dependency source is unresolved, and the definite predictions lack an independent check.':
        status==='withheld_missing_runtime'?'Model interpretation withheld: required runtime values were not supplied, and the definite predictions lack an independent check.':
        status==='withheld_condition_conflict'?'Model interpretation withheld: its condition claims conflict with independently derived facts.':
        status==='withheld_invalid_contract'?'Model interpretation withheld: the response did not follow the required format.':
        'Model interpretation withheld: its predictions conflict with the independently derived outcomes.';
    const gaps=(packet.unresolvedDependencies||[]).map(d=>d.specifier+' (from '+d.from+'): '+d.reason);
    const bindings=(prepared.evidence?.probes||[]).flatMap(p=>(p.missingBindings||[]).map(name=>p.id+': '+name));
    const reply='Experimental deep analysis.\n\n'+
        'Requested inputs: '+prepared.probes.map(p=>p.id+': '+input(p.id)).join('; ')+'.\n\n'+
        'Independently derived outcomes (bounded static analysis; no code executed):\n'+(known.join('\n\n')||'No whole-function outcome was derived for these inputs.')+
        '\n\n'+(analysis?'Model interpretation — explanation remains unverified:\n'+analysis.overview+
            (analysis.assumptions.length?'\nAssumptions: '+analysis.assumptions.join('; '):'')+'\n\n'+analysis.predictions.map(p=>input(p.inputId)+' → '+p.outcome.kind+' '+(p.outcome.type==='unknown'?'unknown':p.outcome.valueJson||'undefined')+' ('+p.outcome.type+'). '+p.reason+
                (p.neededEvidence?'\nModel-proposed needed evidence: '+p.neededEvidence:'')+'\nSource: '+p.citations.map(c=>c.path+':'+c.line).join(', ')).join('\n\n'):
            withheld+(known.length?' Independently derived results are preserved.':' No verified result is available for these inputs.'))+
        (gaps.length?'\n\nDependency source not available in this packet:\n'+gaps.join('\n')+'\nThis does not establish that a module or export is absent at runtime.':'')+
        (bindings.length?'\n\nRuntime values not supplied: '+bindings.join('; ')+'.':'')+
        (correctionFailed?'\nThe bounded correction did not produce a usable answer.':'')+
        '\n\nSource snapshots: '+packet.sources.map(s=>s.path).join(', ')+'.\nA missing static derivation does not establish missing runtime information. Matching predictions do not verify their explanations.\nNo tests run or project knowledge saved.';
    const supportedSpeech=independent.map(p=>'For input '+input(p.inputId)+', the function '+({return:'returns',throw:'throws',resolve:'fulfills with',reject:'rejects with'}[p.outcome.kind]||p.outcome.kind)+' '+show(p.outcome.result)+'.').join(' ');
    const speech=analysis?'This is experimental checked analysis. '+(supportedSpeech?'Under the stated static analysis assumptions, '+supportedSpeech:'No verified result is available for these inputs.')+' The model’s explanation remains unverified and is shown on screen.':
        withheld+' '+(supportedSpeech?'Under the stated static analysis assumptions, '+supportedSpeech:'No verified result is available for these inputs.')+' The source and assumptions are on screen.';
    return {reply,speech};
}
module.exports={render};
