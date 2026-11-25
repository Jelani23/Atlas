const fs=require('node:fs/promises'),path=require('node:path'),h=require('../evaluation/semantic/harness');
function summarize(report,review={runs:[]}){
 if(report.caseSetHash!==h.hash(report.caseSet))throw new Error('Frozen reference hash mismatch.');
 const seen=new Set();
 for(const r of review.runs){
  const row=report.runs.find(x=>x.id===r.id);
  if(!row||seen.has(r.id)||row.status!=='complete'||r.answerHash!==h.hash(row.answer))throw new Error('Invalid or stale review.');
  seen.add(r.id);
 }
 return {reportStatus:report.status,groups:['existing','ordered-multi','ordered-single'].map(mode=>{
  const rows=report.runs.filter(r=>r.mode===mode),reviews=review.runs.filter(r=>rows.some(x=>x.id===r.id));
  return {mode,requests:rows.length,completed:rows.filter(r=>r.status==='complete').length,validContracts:rows.filter(r=>r.structured?.contractStatus==='valid').length,
   requestedProbes:rows.reduce((n,r)=>n+r.inputIds.length,0),scoredProbes:rows.reduce((n,r)=>n+(r.score?.total||0),0),exactCorrect:rows.reduce((n,r)=>n+(r.score?.correct||0),0),
   elapsedMs:rows.reduce((n,r)=>n+r.elapsedMs,0),promptTokens:rows.reduce((n,r)=>n+(r.metrics?.promptTokens||0),0),generatedTokens:rows.reduce((n,r)=>n+(r.metrics?.generatedTokens||0),0),
   reviewedRequests:reviews.length,review:reviews};
 }),boundary:'Invalid and incomplete answers are unscored, not correct. Typed outcomes, explanation review, latency and completion are separate. Single repeat; no reliability estimate.'};
}
async function main(){
 const [file,reviewFile]=process.argv.slice(2);if(!file)throw new Error('Report path required.');
 const report=JSON.parse(await fs.readFile(file,'utf8')),review=reviewFile?JSON.parse(await fs.readFile(reviewFile,'utf8')):undefined;
 const result=summarize(report,review);await fs.writeFile(path.join(path.dirname(file),path.basename(file,'.json')+'-summary.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({...result,groups:result.groups.map(({review,...g})=>g)},null,2));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={summarize};
