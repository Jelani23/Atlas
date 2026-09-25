// Preserve explicitly delimited examples; never translate speech into code here.
function quotedInputs(question){
    const inputs=[];
    const pattern=/"(?:\\.|[^"\\\r\n])*"|`(?:\\.|[^`\\\r\n])*`|“[^”\r\n]*”/g;
    for(const match of String(question).matchAll(pattern)){
        if(inputs.length===4)throw new Error('Please compare at most four quoted examples at a time.');
        inputs.push({id:`input${inputs.length}`,exactText:match[0],start:match.index,end:match.index+match[0].length});
    }
    return inputs;
}
function bindPredictions(predictions,inputs,bundle){
    if(!Array.isArray(predictions)||predictions.length>inputs.length)throw new Error('Invalid input predictions.');
    const seen=new Set();
    return predictions.map(p=>{
        const input=inputs.find(i=>i.id===p.inputId);
        if(!input||seen.has(p.inputId)||Object.keys(p).some(k=>!['inputId','outcome','evidenceIds'].includes(k)))throw new Error('Invalid or duplicate input reference.');
        if(typeof p.outcome!=='string'||!p.outcome.trim()||p.outcome.length>1000)throw new Error('Invalid predicted outcome.');
        seen.add(p.inputId);
        const claim=require('./sourceBundle').bindClaims({claims:[{text:p.outcome,evidenceIds:p.evidenceIds}]},bundle)[0];
        return {...claim,inputId:input.id,exactInput:input.exactText,text:`For ${input.exactText}, my predicted result is ${p.outcome}`};
    });
}
module.exports={quotedInputs,bindPredictions};
