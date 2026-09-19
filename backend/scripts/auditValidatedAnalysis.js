// Read-only local-model probe. No database access or generated-code execution.
require('dotenv').config({quiet:true});
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options) => {
    if (String(url) !== 'http://localhost:11434/api/chat') throw new Error('Only local Ollama is allowed in this audit.');
    return originalFetch(url, options);
};
const {runValidatedAnalysis} = require('../src/reasoning/validatedAnalysis');
const {inspectSource} = require('../src/reasoning/sourceInspection');
const {formatRange} = require('../src/core/sourceReader');
const reader = require('../src/tools/files/readCode');
const ollama = require('../src/models/providers/ollama');
const crypto = require('node:crypto');

async function main() {
    const bug = process.argv.includes('--bug');
    const profile = process.argv.includes('--profile');
    const fixture = process.argv.includes('--fixture') || bug;
    const content = bug ? 'function sum(values) {\n  let total = 0;\n  for (let i = 0; i <= values.length; i++) total += values[i];\n  return total;\n}' :
        'function first(values) {\n  if (!Array.isArray(values)) throw new TypeError("Expected array");\n  return values[0];\n}\nmodule.exports = first;';
    const source = fixture ? formatRange({path:'src/fixture.js',version:crypto.createHash('sha256').update(content).digest('hex'),
        startLine:1,endLine:5,totalLines:5,complete:true,nextLine:null,clippedLine:null,text:content.split('\n').map((line,index)=>`${index+1}: ${line}`).join('\n')})
        : await inspectSource(async (name,args) => {
            if (name !== 'readCode') throw new Error('Only source reads allowed');
            return reader.execute(...args);
        }, profile ? 'src/agents/agentProfiles.js' : 'src/core/sourceReader.js');
    let calls = 0;
    const result = await runValidatedAnalysis({request:profile ? 'Review this code and suggest concrete tests, even if you find no bugs. Cover cache freshness and failed refresh behavior for different cache origins.' : bug ? 'Review this sum function for numeric arrays. Explain a concrete regression input and the exact JavaScript result before and after any suggested fix.' : fixture ? 'Check whether non-array input is guarded. Do not manufacture defects; empty arrays returning undefined are permitted.' :
        'Review path and line-range validation. Account for existing guards and the caller catching errors; do not assume every thrown error is unhandled.', source, runChecks:process.argv.includes('--checks'),
        complete:async (messages,options) => {
            calls++;
            const result = await ollama.complete(messages,{...options,
                ...(process.argv.includes('--general') ? require('../src/models/modelRouter').getDefaultModel() : {}),
                context:8192,keepAlive:'1m',signal:AbortSignal.timeout(60000)});
            console.log(JSON.stringify({phase:calls,raw:result}));
            return result;
        }});
    console.log(JSON.stringify({fixture,calls,result},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
