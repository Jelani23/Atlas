// Structural coverage only: model-provided links are not semantic verification.
function requestParts(question){
    if(/\bset to\b/i.test(question))return [{id:'q0',text:question}];
    const parts=[];let start=0,quoted=false,escaped=false;
    for(let i=0;i<question.length;i++){
        const c=question[i];if(escaped){escaped=false;continue;}
        if(quoted&&c==='\\'){escaped=true;continue;}
        if(c==='"'||c==='`'){quoted=!quoted;continue;}
        if(!quoted){const m=/^\s+and\s+|^[?]\s+(?=\S)/i.exec(question.slice(i));if(m){parts.push(question.slice(start,i));i+=m[0].length-1;start=i+1;}}
    }
    parts.push(question.slice(start));
    // Avoid excessive or fragmentary contracts; no arbitrary truncation of the question.
    return (parts.length>4||parts.some(p=>!p.trim())?[question]:parts).map((text,i)=>({id:'q'+i,text:text.trim()}));
}
function assessCoverage(claims,parts){
    const known=new Set(parts.map(p=>p.id)),covered=new Set();
    for(const claim of claims||[]){
        if(claim.addresses===undefined)continue;
        if(!Array.isArray(claim.addresses)||claim.addresses.some(id=>!known.has(id)))throw new Error('Invalid question-part reference.');
        claim.addresses.forEach(id=>covered.add(id));
    }
    return {status:covered.size===known.size?'model-reported':'incomplete',missing:parts.filter(p=>!covered.has(p.id)),verified:false};
}
module.exports={requestParts,assessCoverage};
