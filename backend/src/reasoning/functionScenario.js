const ts=require('typescript');
const {deriveCompletion,exactOutcome}=require('./functionCompletion');
function evaluateScenarios(bundle,record,inputs,bindings){
    if(!record||!Array.isArray(bindings)||bindings.length>4)throw new Error('Invalid function scenarios.');
    const source=bundle.files.find(f=>f.path===record.source.path);
    if(!source?.complete||source.version!==record.source.version)throw new Error('Scenario source must match the complete function record.');
    const raw=source.source.split('\n').map(l=>l.replace(/^\d+: /,'')).join('\n');
    const ast=ts.createSourceFile(source.path,raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let fn;
    function find(n){if(ts.isFunctionLike(n)&&n.body&&n.getStart(ast)===record.source.start&&n.end===record.source.end)fn=n;ts.forEachChild(n,find);}
    find(ast);if(!fn)throw new Error('Scenario function unavailable.');
    let intrinsicHazard=false;
    function inspect(n){
        if(ts.isWithStatement(n)||ts.isCallExpression(n)&&n.expression.getText(ast)==='eval')intrinsicHazard=true;
        if(ts.isBinaryExpression(n)&&n.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&n.operatorToken.kind<=ts.SyntaxKind.LastAssignment&&/prototype/.test(n.left.getText(ast)))intrinsicHazard=true;
        if(ts.isCallExpression(n)&&/^(Object|Reflect)\.(defineProperty|defineProperties|setPrototypeOf|set)$/.test(n.expression.getText(ast)))intrinsicHazard=true;
        ts.forEachChild(n,inspect);
    }
    inspect(ast);
    const seen=new Set();
    return bindings.map(binding=>{
        const input=inputs.find(i=>i.id===binding.inputId);
        if(!input||seen.has(input.id)||Object.keys(binding).some(k=>!['inputId','parameter','arguments'].includes(k)))throw new Error('Invalid scenario binding.');
        seen.add(input.id);
        let value;try{value=JSON.parse(input.exactText);}catch{throw new Error('Scenario input must be a JSON primitive.');}
        const extra=binding.arguments===undefined?{}:binding.arguments;
        if(!extra||typeof extra!=='object'||Array.isArray(extra)||Object.hasOwn(extra,binding.parameter)||Object.keys(extra).length>8)throw new Error('Invalid scenario arguments.');
        const assignments=new Map([[binding.parameter,value],...Object.entries(extra)]);
        for(const [name,arg] of assignments)if(!record.parameters.includes(name)||!(arg===null||typeof arg==='string'&&arg.length<=2000||typeof arg==='number'&&Number.isFinite(arg)||typeof arg==='boolean'))throw new Error('Unsupported scenario argument.');
        const completion=intrinsicHazard?{status:'partial',paths:[{kind:'unresolved',conditions:[],reason:'Dynamic scope or potential intrinsic mutation in inspected source.'}]}:deriveCompletion(fn,record,{bindings:assignments});
        return {inputId:input.id,arguments:Object.fromEntries(assignments),recordKey:record.cacheKey,completion,outcome:exactOutcome({...record,completion})};
    });
}
function presentScenario(scenario,input){
    const outcome=scenario.outcome;
    if(outcome.status!=='derived')return `For ${input.exactText}, the final outcome is unresolved by the analyzer. Intermediate values do not establish the final result.`;
    const action={return:'returns',throw:'throws',resolve:'returns a promise that fulfills with',reject:'returns a promise that rejects with'}[outcome.kind];
    const value=outcome.result.type==='undefined'?'undefined':outcome.result.type==='number'?outcome.result.value:JSON.stringify(outcome.result.value);
    return `For ${input.exactText}, the supported analysis derives that the function ${action} ${value} (${outcome.result.type}).`;
}
module.exports={evaluateScenarios,presentScenario};
