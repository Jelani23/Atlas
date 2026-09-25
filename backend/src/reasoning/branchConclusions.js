// Conditional branch selection only; no reachability or whole-function return claim.
const {isDeepStrictEqual}=require('node:util');
function deriveBranchConclusions(bundle){
    const facts=new Map(bundle.facts.filter(f=>!f.clipped).map(f=>[f.id,f]));
    return [...facts.values()].filter(f=>f.kind==='expression-result'&&f.result?.type==='boolean'&&typeof f.result.value==='boolean').flatMap(condition=>{
        const guard=facts.get(condition.relatedIds?.[0]);
        if(guard?.kind!=='if'||guard.owner!==condition.owner)return [];
        const children=[...facts.values()].filter(f=>f.parentId===guard.id&&f.owner===guard.owner);
        const then=children.find(f=>f.kind==='then'),otherwise=children.find(f=>f.kind==='else');
        if(!then||typeof guard.hasElse!=='boolean'||guard.hasElse&&!otherwise||!guard.hasElse&&otherwise)return [];
        const selectedBranch=condition.result.value?'then':otherwise?'else':'fallthrough';
        const selected=selectedBranch==='then'?then:otherwise;
        return [{id:'branch-'+condition.id,class:'STATICALLY_DERIVED',kind:'branch-selection',rule:'known-boolean-branch-v1',
            owner:guard.owner,parentId:null,span:guard.span,inputId:condition.inputId,parameter:condition.parameter,arguments:condition.arguments,
            conditionId:condition.id,conditionText:condition.expressionText,conditionValue:condition.result.value,selectedBranch,
            relatedIds:[condition.id,guard.id,then.id,...(otherwise?[otherwise.id]:[])],clipped:false,
            expression:`If this condition is reached, its value is ${condition.result.value}; select ${selectedBranch}.`,
            selectedSpan:selected?.span||null,assumptions:condition.assumptions+' Branch selection only; does not establish branch completion, a returned value, or catch/finally behavior.'}];
    });
}
function checkBranchAssertions(assertions,facts){
    const known=new Map(facts.map(f=>[f.id,f]));const seen=new Set(),issues=[],matched=[];
    if(!Array.isArray(assertions)||assertions.length>known.size)return {status:'rejected',issues:['Invalid branch assertion list.'],matched};
    for(const assertion of assertions){
        const fact=known.get(assertion?.factId);
        if(!fact||seen.has(assertion.factId)||!isDeepStrictEqual(Object.keys(assertion).sort(),['factId','selectedBranch'])){issues.push('Unknown, duplicate or malformed branch assertion.');continue;}
        seen.add(assertion.factId);
        if(assertion.selectedBranch!==fact.selectedBranch)issues.push(`Branch assertion conflicts with ${fact.id}.`);
        else matched.push(fact.id);
    }
    return {status:issues.length?'rejected':matched.length===known.size?'matched':'incomplete',issues,matched};
}
function describeBranch(fact){
    const action={then:'the if branch is selected',else:'the else branch is selected',fallthrough:'the if branch is skipped and control continues after it'}[fact.selectedBranch];
    return `If this condition is reached, it evaluates to ${fact.conditionValue}, so ${action}. This does not establish the final returned result.`;
}
module.exports={deriveBranchConclusions,checkBranchAssertions,describeBranch};
