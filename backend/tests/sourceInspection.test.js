const assert = require('node:assert/strict');
const {inspectSource} = require('../src/reasoning/sourceInspection');
const {formatRange} = require('../src/core/sourceReader');
async function main() {
    const calls = [];
    const execute = async (name, args) => {
        calls.push({name, args});
        const startLine = args[1] || 1;
        return formatRange({path:'src/example.js',version:'fixture-version',startLine,endLine:startLine+79,
            totalLines:1000,complete:false,nextLine:startLine+80,clippedLine:null,text:'source'});
    };
    const result = await inspectSource(execute, 'example.js');
    assert.equal(calls.length, 3);
    assert(calls.every(call => call.name === 'readCode'));
    assert.deepEqual(calls[1].args, ['src/example.js',81,80,'fixture-version']);
    assert.match(result, /unread source starts at line 241/);
    assert.match(result, /No runtime tests or code changes performed/);
    await assert.rejects(inspectSource(execute, 'example', () => true), /cancelled/);
    await assert.rejects(inspectSource(async () => 'Error reading code: changed', 'example'), /Could not read/);
    let count = 0;
    await assert.rejects(inspectSource(async (name,args) => {
        const page = await execute(name,args);
        return ++count === 2 ? page.replace('fixture-version', 'changed') : page;
    }, 'example'), /coverage changed/);
    const legacy = await inspectSource(async () => 'Content of example:\n[preview truncated]', 'example');
    assert.match(legacy, /preview truncated/);
    console.log('Bounded source inspection, version consistency, cancellation and read-only boundaries passed.');
}
main().catch(error => {console.error(error);process.exitCode=1;});
