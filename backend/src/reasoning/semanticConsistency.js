const {isDeepStrictEqual}=require('node:util');
// Validate structured expression assertions only. This is not prose entailment.
function checkAssertions(assertions,facts){
    const known=new Map(facts.filter(f=>f.kind==='expression-result').map(f=>[f.id,f]));
    if(!Array.isArray(assertions)||assertions.length>known.size)return {status:'rejected',issues:['Invalid expression assertion list.'],matched:[]};
    const seen=new Set(),issues=[],matched=[];
    for(const assertion of assertions){
        const fact=known.get(assertion?.factId);
        if(!fact||seen.has(assertion.factId)||Object.keys(assertion).some(k=>!['factId','resultJson'].includes(k))){issues.push('Unknown, duplicate or malformed expression assertion.');continue;}
        seen.add(assertion.factId);
        let value;try{value=JSON.parse(assertion.resultJson);}catch{issues.push(`Malformed value for ${fact.id}.`);continue;}
        if(!isDeepStrictEqual(value,fact.result))issues.push(`Expression assertion conflicts with ${fact.id}.`);
        else matched.push(fact.id);
    }
    return {status:issues.length?'rejected':matched.length===known.size?'matched':'incomplete',issues,matched};
}
module.exports={checkAssertions};
