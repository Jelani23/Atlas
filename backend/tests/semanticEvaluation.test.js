const assert=require('node:assert/strict');
const h=require('../evaluation/semantic/harness');
const {observations}=require('../evaluation/semantic/oracles');
async function main(){
    assert.equal(h.manifest.cases.length,24);
    assert.equal(h.manifest.cases.filter(c=>c.split==='heldout').length,12);
    for(const family of new Set(h.manifest.cases.map(c=>c.family)))assert.equal(new Set(h.manifest.cases.filter(c=>c.family===family).map(c=>c.split)).size,1);
    const observed=observations();
    for(const row of observed){
        const test=h.manifest.cases.find(c=>c.id===row.id);
        for(const probe of row.probes) assert.deepEqual(probe.actual,test.probes.find(p=>p.id===probe.id).expected,`${row.id}/${probe.id}`);
    }
    assert.equal(observed.length,22); // Two missing-information cases are reviewed, never executed.
    for(const test of h.manifest.cases){
        const evidence=await h.prepare(test);
        const a=h.requestFor(evidence,'A'),b=h.requestFor(evidence,'B');
        assert.equal(b.messages.at(-1).content,evidence.question);
        assert(a.messages.at(-1).content.endsWith(evidence.question));
        for(const source of evidence.packet.sources){assert(a.messages[1].content.includes(source.source));assert(b.messages[1].content.includes(JSON.stringify(source.source).slice(1,-1)));}
        for(const request of [a,b]) {assert(!JSON.stringify(request.messages).includes('"expected":'));assert(!JSON.stringify(request.messages).includes('"criteria":'));}
        assert(!a.format);assert(b.format);
        const d=h.requestFor(evidence,'D'),compact=h.requestFor(evidence,'E');
        assert.deepEqual(compact.format,d.format);
        assert.equal(compact.messages[1].content,d.messages[1].content);
        assert(compact.messages[0].content.length<d.messages[0].content.length);
        assert(!JSON.stringify(compact.messages).includes('"expected":'));
        assert(!JSON.stringify(compact.messages).includes('"criteria":'));
        assert.deepEqual(h.inspectStructured('{}',evidence,'E'),h.inspectStructured('{}',evidence,'D'));
    }
    const test=h.manifest.cases.find(c=>c.id==='numeric-whole'),e=await h.prepare(test);
    assert(e.checks.facts.some(f=>f.inputId==='p3'&&f.result.value==='NaN'));
    const c=h.requestFor(e,'C');assert(c.format.properties.expressionAssertions);
    const ref={path:e.packet.sources[0].path,line:1};
    const value={claims:[{kind:'behavior',text:'Test interpretation.',assumptions:[],citations:[ref]}],unknowns:[],examples:[],expressionAssertions:e.checks.facts.map(f=>({factId:f.id,resultJson:JSON.stringify(f.result)}))};
    assert.equal(h.inspectStructured(JSON.stringify(value),e,'C').assertionCheck.status,'matched');
    value.expressionAssertions[0].resultJson='{"type":"number","value":"99"}';
    const conflict=h.inspectStructured(JSON.stringify(value),e,'C');
    assert.equal(conflict.assertionCheck.status,'rejected');assert.equal(conflict.released.status,'withheld_structured_conflict');assert.deepEqual(conflict.released.modelClaims,[]);
    value.expressionAssertions=[];assert.equal(h.inspectStructured(JSON.stringify(value),e,'C').assertionCheck.status,'incomplete');
    const review={outcomes:test.probes.map(p=>({id:p.id,actual:p.expected,evidence:'Reviewed test fixture.'})),criteria:test.criteria.map(c=>({id:c.id,verdict:'pass',evidence:'Reviewed test explanation.'})),contradictions:[],unjustifiedUncertainty:[],depth:{score:2,rationale:'Core operations covered.'}};
    assert.equal(h.score(test,review).exactOutcomes.correct,3);
    review.outcomes[0].actual={kind:'return',value:{type:'number',value:99}};
    assert.equal(h.score(test,review).exactOutcomes.correct,2);
    review.outcomes[0].id='bad';assert.throws(()=>h.score(test,review),/Missing/);
    assert.equal(h.score(test).status,'awaiting_review');
    assert.equal(h.inspectStructured('{',e,'B').contractStatus,'invalid_json');
    assert.equal(h.inspectStructured('null',e,'C').contractStatus,'invalid');
    assert.equal(h.inspectStructured('[]',e,'C').contractStatus,'invalid');
    const summarize=require('../scripts/summarizeSemanticEvaluation').summarize;
    const report={caseSetHash:h.hash(h.manifest),caseSet:h.manifest,cases:[{id:test.id,evidence:e}],runs:[{id:'r',model:'fixture',case:test.id,condition:'B',repeat:0,status:'complete',attempts:[{answer:'answer',status:'complete',elapsedMs:2,metrics:{generatedTokens:3}}]}]};
    const validReview={...review,id:'r',answerHash:h.hash('answer'),outcomes:test.probes.map(p=>({id:p.id,actual:p.expected,evidence:'Reviewed answer.'})),contradictions:['A claim contradicts its example.']};
    const summary=summarize(report,{runs:[validReview]});
    assert.equal(summary.rows[0].release.status,'withheld_after_semantic_review');assert(summary.rows[0].release.independentEvidence.facts.length);
    assert.equal(summarize(report,{runs:[{...validReview,contradictions:[],criteria:validReview.criteria.map((c,i)=>i===0?{...c,verdict:'fail'}:c)}]}).rows[0].release.status,'withheld_after_semantic_review');
    assert.throws(()=>summarize(report,{runs:[{...validReview,answerHash:'stale'}]}),/hash/);
    assert.throws(()=>summarize(report,{runs:[validReview,validReview]}),/duplicate/);
    assert.throws(()=>summarize(report,{runs:[{...validReview,attemptReviews:[{...validReview,attemptIndex:0,answerHash:'stale'}]}]}),/attempt review/);
    assert.equal(summarize(report,{runs:[{...validReview,attemptReviews:[{...validReview,attemptIndex:0}]}]}).rows[0].correctionReviews[0].semantic.exactOutcomes.correct,3);
    assert.equal(summarize(report).groups[0].reviewed,0);
    const incomplete={...report,runs:[{...report.runs[0],status:'incomplete'}]};
    assert.equal(summarize(incomplete).rows[0].release.status,'withheld_incomplete_or_invalid');
    assert.equal(summarize(incomplete).rows[0].semantic.status,'not_scored_incomplete');
    assert.throws(()=>summarize(incomplete,{runs:[validReview]}),/Incomplete/);
    const conflictReport={...report,runs:[{...report.runs[0],attempts:[{...report.runs[0].attempts[0],structured:{contractStatus:'valid',assertionCheck:{status:'rejected'}}}]}]};
    assert.equal(summarize(conflictReport,{runs:[{...validReview,contradictions:[]}]}).rows[0].release.status,'withheld_incomplete_or_invalid');
    console.log('Semantic evaluation: 24 source packets, 22 fixed pure oracles, split isolation, check rejection and scoring passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
