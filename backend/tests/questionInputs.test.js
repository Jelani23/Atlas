const assert=require('node:assert/strict');
const {quotedInputs,bindPredictions}=require('../src/reasoning/questionInputs');
const {createService}=require('../src/reasoning/projectQuestion');
async function main(){
    const question='Compare "two plus three" and `  x  ` with “a\tb”.';
    const inputs=quotedInputs(question);
    assert.deepEqual(inputs.map(i=>i.exactText),['"two plus three"','`  x  `','“a\tb”']);
    for(const i of inputs)assert.equal(question.slice(i.start,i.end),i.exactText);
    assert.equal(quotedInputs('What happens with two plus three?').length,0);
    assert.equal(quotedInputs('What about "a\\\"b"?')[0].exactText,'"a\\\"b"');
    assert.throws(()=>quotedInputs('"a" "b" "c" "d" "e"'),/four/);
    const bundle={facts:[{id:'f',span:{path:'src/a.js',start:0,end:2,line:1},clipped:false}],files:[]};
    const prediction={inputId:'input0',outcome:'null.',evidenceIds:['f']};
    assert.match(bindPredictions([prediction],inputs,bundle)[0].text,/two plus three/);
    assert.throws(()=>bindPredictions([{...prediction,inputId:'missing'}],inputs,bundle),/reference/);
    assert.throws(()=>bindPredictions([prediction,prediction],inputs,bundle),/duplicate/);
    assert.throws(()=>bindPredictions([{...prediction,exactInput:'plus three'}],inputs,bundle),/reference/);
    const source={path:'src/a.js',version:'a'.repeat(64),complete:true,text:'1: function f(x){return x;}'};
    const service=createService({repository:{get:async()=>null},read:async()=>source,evidenceBundle:true});
    const result=await service.answer({filename:source.path,question:'What does f return for "  two plus three  "?'},{agentId:'alice',complete:async(m,o)=>{
        assert.deepEqual(o.format.properties.predictions.items.properties.inputId.enum,['input0']);
        return JSON.stringify({claims:[{text:'It returns its argument.',evidenceIds:['v0:f1']}],predictions:[{inputId:'input0',outcome:'the unchanged string.',evidenceIds:['v0:f1']}],unknowns:[]});
    }});
    assert.match(result.reply,/For "  two plus three  "/);
    assert.match(result.speech,/For "  two plus three  "/);
    assert.equal(result.answer.predictions[0].status,'MODEL_INFERRED');
    await assert.rejects(service.answer({filename:source.path,question:'Explain the function.'},{agentId:'alice',complete:async()=>JSON.stringify({claims:[],unknowns:[],predictions:[prediction]})}),/preserved input/);
    console.log('Quoted input preservation, prediction references and shared presentation passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
