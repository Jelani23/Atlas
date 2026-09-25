// Explicit opt-in and argument assignments only. Never infer operands from ordinary prose.
function normalize(value){return value.replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function selectTarget(bundle,requested){
    const symbols=bundle.symbols.filter(s=>s.span.path===bundle.files[0].path&&s.owner.endsWith(':module'));
    const stem=bundle.files[0].path.split('/').pop().replace(/\.js$/,'');
    const exact=symbols.filter(s=>normalize(s.name)===normalize(requested||stem));
    const selected=exact.length===1?exact[0]:!requested&&symbols.length===1?symbols[0]:null;
    if(!selected)throw new Error('Please name one function to analyze. Available functions: '+symbols.map(s=>s.name).join(', '));
    return selected.name;
}
function parseAssignments(question,bundle){
    const match=/\bwith\s+([\s\S]+?\s+set to\s+[\s\S]+)$/i.exec(question);
    if(!match){if(/\bset to\b/i.test(question))throw new Error('Give arguments after with, using parameter name set to value.');return null;}
    const target=bundle.symbols.find(s=>s.id===bundle.target.symbolId);
    const parts=[];let start=0,quoted=false,escaped=false;
    for(let i=0;i<match[1].length;i++){
        const char=match[1][i];
        if(escaped){escaped=false;continue;}
        if(quoted&&char==='\\'){escaped=true;continue;}
        if(char==='"'){quoted=!quoted;continue;}
        if(!quoted){const separator=/^\s+and\s+(?=[a-z][a-z0-9 ]*?\s+set to\s+)/i.exec(match[1].slice(i));if(separator){parts.push(match[1].slice(start,i));i+=separator[0].length-1;start=i+1;}}
    }
    parts.push(match[1].slice(start));
    if(parts.length>8)throw new Error('Please use at most eight explicit arguments.');
    const values=new Map(),original=[];
    for(const part of parts){
        const assignment=/^([a-z][a-z0-9 ]*?)\s+set to\s+([\s\S]+)$/i.exec(part);
        if(!assignment)throw new Error('Use parameter name followed by set to and its value.');
        const matches=target.parameters.filter(p=>/^[a-zA-Z_$][\w$]*$/.test(p)&&normalize(p)===normalize(assignment[1]));
        if(matches.length!==1||values.has(matches[0]))throw new Error('Argument name must match one unique function parameter: '+assignment[1]);
        const raw=assignment[2].trim();
        // Explicit speech delimiter; never strip ambiguous punctuation from bare data.
        const delimited=raw.startsWith('"')?raw:raw.replace(/\s+end input[.!?]?$/i,'');
        let value=delimited;
        const literal=delimited.startsWith('"')?delimited.replace(/(?<=")[.!?]$/,''):delimited;
        if(literal.startsWith('"')){try{value=JSON.parse(literal);}catch{throw new Error('Quoted argument must be a complete JSON string.');}if(typeof value!=='string')throw new Error('Expected a quoted string.');}
        else if(/^(true|false)$/.test(literal))value=literal==='true';
        else if(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(literal))value=Number(literal);
        if(typeof value==='number'&&!Number.isFinite(value)||typeof value==='string'&&value.length>2000)throw new Error('Argument exceeds the supported value limit.');
        values.set(matches[0],value);original.push({parameter:matches[0],rawText:raw});
    }
    const [parameter,value]=values.entries().next().value;
    return {inputs:[{id:'input0',exactText:JSON.stringify(value),origin:'explicit-spoken-assignment',assignments:original}],bindings:[{inputId:'input0',parameter,arguments:Object.fromEntries([...values].slice(1))}]};
}
module.exports={selectTarget,parseAssignments};
