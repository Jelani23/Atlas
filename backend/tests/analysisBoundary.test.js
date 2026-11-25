const assert=require('node:assert/strict'),h=require('../evaluation/semantic/harness');
const {capture}=require('../scripts/auditAnalysisBoundary');
const {buildRequestBody}=require('../src/models/providers/ollama');
async function main(){
 const e=await h.prepare(h.manifest.cases.find(c=>c.id==='guard-method'));
 for(const deep of [false,true]){
  const c=await capture(e,deep),body=buildRequestBody(c.messages,c.options,false);
  assert.equal(body.model,require('../src/models/modelRouter').getDefaultModel().model);
  assert.equal(body.think,deep);assert.equal(body.options.num_predict,deep?12000:900);
  assert.equal(body.options.num_ctx,deep?16384:8192);
  assert.deepEqual(body.messages,c.messages);assert.deepEqual(body.format,c.options.format);
  assert(c.messages.some(m=>m.content.includes(JSON.stringify(e.packet.sources[0].source).slice(1,-1))));
  assert(!JSON.stringify(c.messages).includes('"expected":'));
 }
 console.log('Analysis boundary: source preservation, actual service model/options and provider payload mapping passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
