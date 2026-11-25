// Reuse the explicit spoken argument grammar and bounded static scenario analyzer.
// No argument values are inferred from prose and no repository code is executed.
const checker=require('./checkedPredictions');
function prepare(bundle,root,packet,question){
    const scoped=require('./symbolScope').scopeBundle(bundle,root.name);
    const assigned=require('./spokenAnalysis').parseAssignments(question,scoped);
    if(!assigned)return null;
    const binding=assigned.bindings[0];
    const args={...binding.arguments,[binding.parameter]:JSON.parse(assigned.inputs[0].exactText)};
    if(root.parameters.some(p=>!Object.hasOwn(args,p))||Object.keys(args).length!==root.parameters.length)throw new Error('Checked deep analysis needs an explicit value for every function parameter.');
    const probes=[{id:'p1',args:root.parameters.map(p=>args[p])}];
    const inputs=assigned.inputs.map(input=>({...input,id:'p1'}));
    const bindings=assigned.bindings.map(item=>({...item,inputId:'p1'}));
    const scenarios=require('./functionScenario').evaluateScenarios(bundle,root,inputs,bindings);
    return {probes,evidence:checker.bindEvidence(packet,scenarios,probes),request:checker.requestFor(packet,probes,question)};
}
module.exports={prepare};
