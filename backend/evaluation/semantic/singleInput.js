// Evaluation only. Split authored inputs without executing source or exposing references.
const h=require('./harness');
function jobs(test,evidence,mode,budget=6000){
    if(!['existing','ordered-multi','ordered-single'].includes(mode))throw new Error('Unknown comparison mode.');
    if(!Number.isInteger(budget)||budget<3072||budget>12000)throw new Error('Invalid total token budget.');
    const groups=mode==='ordered-single'?evidence.probes.map(p=>[p]):[evidence.probes];
    return groups.map(probes=>{
        const ids=new Set(probes.map(p=>p.id));
        const selected={...test,probes:test.probes.filter(p=>ids.has(p.id))};
        const question=h.question(selected);
        const scoped={...evidence,question,probes,checks:{...evidence.checks,scenarios:evidence.checks.scenarios.filter(s=>ids.has(s.inputId))}};
        const request=h.requestFor(scoped,'D');
        if(mode!=='existing')request.messages[0].content+='\nFor each prediction, give a short source-grounded explanation in reason with four labeled parts: Input (value and type); Branch (first decisive condition and selected branch, or none); Operation (next decisive operation, early return or escaping error); Outcome (whole-function result). Describe observable code behavior, not private deliberation. Keep each part to one sentence; include any additional decisive operations needed for correctness.';
        return {ids:[...ids],evidence:scoped,request,maxTokens:Math.floor(budget/groups.length)};
    });
}
module.exports={jobs};
