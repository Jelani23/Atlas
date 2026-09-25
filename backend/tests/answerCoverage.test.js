const assert=require('node:assert/strict');
const {requestParts,assessCoverage}=require('../src/reasoning/answerCoverage');
const parts=requestParts('How does it handle duplicates and punctuation?');
assert.equal(parts.length,2);
assert.equal(requestParts('Explain "salt and pepper"').length,1);
assert.equal(requestParts('Analyze with text set to salt and pepper').length,1);
assert.equal(requestParts('Does it validate? What happens afterward?').length,2);
assert.deepEqual(assessCoverage([{addresses:['q0']}],parts).missing,[parts[1]]);
assert.equal(assessCoverage([{addresses:['q0','q1']}],parts).status,'model-reported');
assert.equal(assessCoverage([{addresses:['q0','q1']}],parts).verified,false);
assert.equal(assessCoverage([{}],parts).missing.length,2);
assert.throws(()=>assessCoverage([{addresses:['invented']}],parts),/Invalid/);
console.log('Question-part coverage reports missing links without certifying semantic completeness.');

(async()=>{
    const source={path:'src/example.js',version:'a'.repeat(64),complete:true,text:'1: function example(text){ return text; }'};
    const service=require('../src/reasoning/projectQuestion').createService({repository:{get:async()=>null},read:async()=>source,evidenceBundle:true,coverageContract:true});
    const result=await service.answer({filename:source.path,question:'Explain input and output',targetSymbol:'example'},{agentId:'alice',complete:async(m,o)=>{
        assert(o.format.properties.claims.items.required.includes('addresses'));
        const ids=o.format.properties.claims.items.properties.evidenceIds.items.enum;
        return JSON.stringify({claims:[{text:'It accepts text.',addresses:['q0'],evidenceIds:ids.slice(0,2)}],unknowns:[]});
    }});
    assert.equal(result.questionCoverage.status,'incomplete');assert.match(result.reply,/Not yet addressed: output/);
    const citation=result.reply.split('\n').find(l=>l.startsWith('Source:'));
    assert.equal(citation,'Source: src/example.js:1');
})().catch(e=>{console.error(e);process.exitCode=1;});
