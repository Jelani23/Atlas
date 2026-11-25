const fs=require('node:fs/promises'),path=require('node:path');
const h=require('../evaluation/semantic/harness');
function summarize(report,reviews={runs:[]}){
    const caseSet=report.caseSet||h.manifest;
    if(report.caseSetHash!==h.hash(caseSet)) throw new Error('Case set changed; review against its frozen version.');
    const ids=new Set();
    for(const review of reviews.runs){if(ids.has(review.id)||!report.runs.some(r=>r.id===review.id))throw new Error('Unknown or duplicate review run.');ids.add(review.id);}
    const rows=report.runs.map(row=>{
        const attempt=row.attempts?.at(-1),review=reviews.runs.find(r=>r.id===row.id);
        if(review&&row.status!=='complete')throw new Error('Incomplete responses cannot receive semantic pass scores.');
        if(review&&review.answerHash!==h.hash(attempt?.answer||''))throw new Error('Review answer hash mismatch.');
        const test=caseSet.cases.find(c=>c.id===row.case);
        const attemptIndices=new Set();
        const correctionReviews=(review?.attemptReviews||[]).map(item=>{
            const index=item.attemptIndex,prior=row.attempts?.[index];
            if(!Number.isInteger(index)||index<0||attemptIndices.has(index)||prior?.status!=='complete'||item.answerHash!==h.hash(prior.answer||''))throw new Error('Invalid correction attempt review or hash.');
            attemptIndices.add(index);return {attemptIndex:index,semantic:h.score(test,item)};
        });
        const semantic=row.status==='complete'?h.score(test,review):{status:'not_scored_incomplete'};
        const fixedOutcomes=['D','E'].includes(row.condition)&&row.status==='complete'?h.scoreTyped(test,attempt?.structured):null;
        const withheld=semantic.status==='reviewed'&&(semantic.exactOutcomes.correct<semantic.exactOutcomes.total||semantic.explanation.some(c=>c.verdict==='fail')||semantic.contradictions.length>0||semantic.otherSemanticErrors.length>0)||fixedOutcomes?.results?.some(r=>r.status==='incorrect');
        const integrityRejected=row.status!=='complete'||(attempt?.structured?.contractStatus&& !['valid','not_applicable'].includes(attempt.structured.contractStatus))||attempt?.structured?.assertionCheck&&attempt.structured.assertionCheck.status!=='matched'||Boolean(attempt?.structured?.predictionCheck?.conflicts.length);
        return {id:row.id,model:row.model,condition:row.condition,case:row.case,split:test.split,repeat:row.repeat,
            correctionFrom:row.correctionFrom||null,
            requestedOutcomes:test.probes.length,
            transport:row.status,completion:attempt?.status,contract:attempt?.structured?.contractStatus,citationLocations:attempt?.structured?.citationStatus,
            elapsedMs:row.elapsedMs??(row.attempts||[]).reduce((n,a)=>n+a.elapsedMs,0),generatedTokens:(row.attempts||[]).reduce((n,a)=>n+(a.metrics.generatedTokens||0),0),attempts:row.attempts?.length||0,
            semantic,fixedOutcomes,correctionReviews,correctionOutcomes:['D','E'].includes(row.condition)?(row.attempts||[]).map(a=>({completion:a.status,score:a.status==='complete'?h.scoreTyped(test,a.structured):null,check:a.structured?.predictionCheck})):undefined,
            release:withheld||integrityRejected?{status:withheld?'withheld_after_semantic_review':'withheld_incomplete_or_invalid',modelClaims:[],independentEvidence:report.cases.find(c=>c.id===row.case)?.evidence.checks}:{status:'unverified_interpretation'}};
    });
    const groups=[];
    for(const key of new Set(rows.map(r=>`${r.model}|${r.condition}|${r.split}`))){
        const members=rows.filter(r=>`${r.model}|${r.condition}|${r.split}`===key),reviewed=members.filter(r=>r.semantic.status==='reviewed');
        groups.push({key,runs:members.length,completed:members.filter(r=>r.completion==='complete').length,reviewed:reviewed.length,
            requestedOutcomes:members.reduce((n,r)=>n+r.requestedOutcomes,0),
            contractValid:members.filter(r=>r.contract==='valid').length,citationLocationsValid:members.filter(r=>r.citationLocations==='valid_locations_only').length,
            citationReviews:reviewed.map(r=>({case:r.case,repeat:r.repeat,assessment:r.semantic.citations})),
            exactCorrect:reviewed.reduce((n,r)=>n+r.semantic.exactOutcomes.correct,0),exactTotal:reviewed.reduce((n,r)=>n+r.semantic.exactOutcomes.total,0),
            automaticTypedOutcomes:{correct:members.reduce((n,r)=>n+(r.fixedOutcomes?.correct||0),0),total:members.reduce((n,r)=>n+(r.fixedOutcomes?.total||0),0),uncertaintyNeedsReview:members.reduce((n,r)=>n+(r.fixedOutcomes?.results?.filter(p=>p.status==='needs_uncertainty_review').length||0),0)},
            coverageMet:reviewed.reduce((n,r)=>n+r.semantic.coverage.met,0),coverageTotal:reviewed.reduce((n,r)=>n+r.semantic.coverage.total,0),
            contradictionCount:reviewed.reduce((n,r)=>n+r.semantic.contradictions.length,0),unjustifiedUncertaintyCount:reviewed.reduce((n,r)=>n+r.semantic.unjustifiedUncertainty.length,0),
            otherSemanticErrorCount:reviewed.reduce((n,r)=>n+r.semantic.otherSemanticErrors.length,0),
            depthScores:reviewed.map(r=>({case:r.case,repeat:r.repeat,...r.semantic.depth})),
            meanLatencyMs:members.reduce((n,r)=>n+r.elapsedMs,0)/members.length});
    }
    const consistency=[];
    for(const row of report.runs.filter(r=>r.repeat>0)){
        const first=report.runs.find(r=>r.model===row.model&&r.case===row.case&&r.condition===row.condition&&r.repeat===0);
        const a=reviews.runs.find(r=>r.id===first?.id),b=reviews.runs.find(r=>r.id===row.id);
        consistency.push({id:row.id,exactTextSame:first?.attempts?.at(-1)?.answer===row.attempts?.at(-1)?.answer,
            normalizedOutcomesSame:a&&b?require('node:util').isDeepStrictEqual(a.outcomes.map(p=>p.actual),b.outcomes.map(p=>p.actual)):null});
    }
    return {version:1,reviewer:reviews.reviewer||'unreviewed',groups,consistency,rows,boundary:'Dimensions are separate. Missing reviews are not passes; agreement and citation validity are not semantic verification.'};
}
async function main(){
    const [reportPath,reviewPath]=process.argv.slice(2);if(!reportPath)throw new Error('Usage: node summarizeSemanticEvaluation.js REPORT [REVIEWS]');
    const report=JSON.parse(await fs.readFile(reportPath,'utf8')),review=reviewPath?JSON.parse(await fs.readFile(reviewPath,'utf8')):undefined;
    const result=summarize(report,review),output=path.join(path.dirname(reportPath),path.basename(reportPath,'.json')+'-summary.json');
    await fs.writeFile(output,JSON.stringify(result,null,2));console.log(JSON.stringify({output,groups:result.groups,consistency:result.consistency},null,2));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={summarize};
