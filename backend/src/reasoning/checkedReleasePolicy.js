// Conservative release control. Gaps do not prove a prediction false.
function apply(result,packet,evidence){
    const dependencies=packet.unresolvedDependencies||[];
    const affected=(result.analysis?.predictions||[]).filter(p=>
        result.predictionCheck?.unverified.includes(p.inputId)&&p.normalized.kind!=='unknown'&&
        (dependencies.length||evidence.probes.find(i=>i.id===p.inputId)?.missingBindings?.length));
    if(!affected.length||!result.released?.modelInterpretation)return result;
    const runtimeBindings=affected.flatMap(p=>(evidence.probes.find(i=>i.id===p.inputId)?.missingBindings||[]).map(name=>({inputId:p.inputId,name})));
    return {...result,dependencyCheck:{status:'unverified_with_missing_evidence',inputIds:affected.map(p=>p.inputId),dependencies,runtimeBindings},
        released:{...result.released,status:dependencies.length?'withheld_unverified_dependency':'withheld_missing_runtime',modelInterpretation:null,explanationVerified:false}};
}
function requireCheckedOutcomes(result){
    if(!result.released.modelInterpretation||!result.predictionCheck.unverified.length)return result;
    return {...result,released:{...result.released,status:'withheld_unchecked_outcome',modelInterpretation:null,explanationVerified:false}};
}
module.exports={apply,requireCheckedOutcomes};
