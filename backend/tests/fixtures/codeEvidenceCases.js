const assert=require('node:assert/strict');
const {capture,followUp,isContinuation}=require('../../src/core/codeEvidence');
const header=version=>`Content of src/example.js:\n[Source coverage: ${JSON.stringify({path:'src/example.js',version,nextLine:10})}]\n1: const value = 1;`;
const route=toolResult=>({needsTool:true,toolName:'readCode',toolResult});
const cases=[
    {id:'short-hash',symbol:'capture',scenario:'Capture a short tool result with a 16-character version (1234567890abcdef), nextLine 10, agent alice, timestamp 100.'},
    {id:'valid-coverage',symbol:'capture',scenario:'Capture the same short result with a 64-character lowercase hexadecimal version, nextLine 10, agent alice, timestamp 100.'},
    {id:'tool-origin',symbol:'capture',scenario:'Attempt capture with needsTool false, then with toolName searchCode. Both contain an otherwise valid read result.'},
    {id:'agent-ownership',symbol:'followUp',scenario:'Capture evidence for alice at timestamp 100. Ask about that code at 200 as bob, then as alice.'},
    {id:'expiry-boundary',symbol:'followUp',scenario:'Capture for alice at 100. Ask about that code at 600100 (age 600000), then 600101 (age 600001).'},
    {id:'follow-up-matching',symbol:'isContinuation/followUp',scenario:'With fresh alice evidence, test "Please read the next section of that code.", "Explain that code", and unrelated "What games do you like?".'},
    {id:'whole-line-truncation',symbol:'capture',scenario:'Capture a result containing Content of src/example.js, a complete short line, and one 13000-character numbered line. Check that the final oversized line is omitted entirely.'}
];
async function oracle(c){
    const text=header('a'.repeat(64));
    const evidence=capture(route(text),'alice',100);
    let observed,expected;
    switch(c.id){
        case 'short-hash': {
            const input=header('1234567890abcdef'),result=capture(route(input),'alice',100);
            observed={coverage:result.coverage,textUnchanged:result.toolResult===input,capturedAt:result.capturedAt};
            expected={coverage:null,textUnchanged:true,capturedAt:100};break;
        }
        case 'valid-coverage':
            observed={coverage:evidence.coverage,textUnchanged:evidence.toolResult===text,agentId:evidence.agentId};
            expected={coverage:{path:'src/example.js',version:'a'.repeat(64),nextLine:10},textUnchanged:true,agentId:'alice'};break;
        case 'tool-origin':
            observed={notTool:capture({...route(text),needsTool:false},'alice',100),wrongTool:capture({...route(text),toolName:'searchCode'},'alice',100)};
            expected={notTool:null,wrongTool:null};break;
        case 'agent-ownership':
            observed={otherAgent:followUp('Explain that code',evidence,'bob',200),sameAgentReturnsOriginal:followUp('Explain that code',evidence,'alice',200)===evidence};
            expected={otherAgent:null,sameAgentReturnsOriginal:true};break;
        case 'expiry-boundary':
            observed={at600000ReturnsOriginal:followUp('Explain that code',evidence,'alice',600100)===evidence,at600001:followUp('Explain that code',evidence,'alice',600101)};
            expected={at600000ReturnsOriginal:true,at600001:null};break;
        case 'follow-up-matching':
            observed={continuation:isContinuation('Please read the next section of that code.'),explanationIsContinuation:isContinuation('Explain that code'),explanationReturnsOriginal:followUp('Explain that code',evidence,'alice',200)===evidence,unrelated:followUp('What games do you like?',evidence,'alice',200)};
            expected={continuation:true,explanationIsContinuation:false,explanationReturnsOriginal:true,unrelated:null};break;
        case 'whole-line-truncation': {
            const prefix='Content of src/example.js:\n1: const value = 1;';
            const result=capture(route(prefix+'\n2: '+'x'.repeat(13000)),'alice',100);
            observed={retained:result.toolResult,containsPartialLine:result.toolResult.includes('2: ')};
            expected={retained:prefix+'\n[evidence excerpt truncated]',containsPartialLine:false};break;
        }
        default:throw new Error('Unknown fixed case');
    }
    assert.deepEqual(observed,expected);return observed;
}
module.exports={cases,oracle};
