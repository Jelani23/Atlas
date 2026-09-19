const assert = require('node:assert/strict');
function stub(name, exports) {
    const id = require.resolve(name); require.cache[id] = {id, filename:id, loaded:true, exports};
}
let calls = [], source = 'Content of example.js:\nfunction value() {return 1;}\n[preview truncated]';
let saveResult = 'Error saving note: fixture failure';
stub('../src/tools/toolExecutor', {execute: async (name, args) => {
    calls.push({name,args});
    if (name === 'readCode') return source;
    if (name === 'writeNote') return saveResult; // Mock only; never writes a note.
    throw new Error('No writes or other tools allowed in this analysis test');
}});
let modelCalls = [];
stub('../src/models/modelAdapter', {createModelAdapter: () => ({complete: async (messages, options) => {
    modelCalls.push({messages,options}); return 'No defect established in the supplied excerpt.';
}})});
stub('../src/tasks/taskManager', {createTask: async (_name, callback) => {
    await callback({updateProgress() {}, isCancelled: () => false}); return 'fixture-task';
}});
const analysis = require('../src/reasoning/codeAnalysis');
const background = require('../src/planner/routing/backgroundRouter');
async function main() {
    assert(analysis.isAnalysisRequest('Review that code for bugs'));
    assert(analysis.isAnalysisRequest('Do a deep analysis of that code'));
    assert(!analysis.isAnalysisRequest('What music do you like?'));
    assert(analysis.isAnalysisRequest('Compare alternatives', 'analysis'));
    for (const value of ['', 'Error reading code: missing', 'No files could be read.', 'Content of x:\nError: missing']) assert(!analysis.usableSource(value));
    assert(analysis.usableSource(source));
    const prompt = analysis.buildAnalysisPrompt('Review it', source);
    assert.match(prompt, /may be partial/);
    assert.match(prompt, /concrete regression test/);
    assert.doesNotMatch(prompt, /entire file content is provided|Do NOT claim it is.*incomplete/);
    await background.handleTask({intent:'analyze_and_suggest',filename:'example.js'}, 'Review this code and suggest improvements', 'fixture', 'fixture');
    assert.deepEqual(calls.map(c=>c.name), ['readCode']);
    assert.equal(modelCalls.length,1);
    assert.equal(modelCalls[0].options.think,false);
    assert(modelCalls[0].options.maxTokens >= 1600);
    assert.equal(modelCalls[0].options.model, require('../src/models/modelRouter').getModelForTask('analyze_and_suggest').model);
    assert.match(modelCalls[0].messages[1].content, /preview truncated/);
    source = 'Error reading code: unavailable';
    await assert.rejects(background.handleTask({intent:'analyze_and_suggest',filename:'missing.js'}, 'Review it', 'fixture', 'fixture'), /Could not read/);
    assert.equal(modelCalls.length,1,'Missing source must not reach the model as implementation evidence');
    source='Content of example.js:\nconst value=1;';
    await assert.rejects(background.handleTask({intent:'analyze_and_save',target_filename:'example.js',filename:'fixture'},
        'Analyze and save to fixture','fixture','fixture'),/not confirmed saved/);
    saveResult='Successfully saved the note to notes/fixture.txt.';
    await background.handleTask({intent:'analyze_and_save',target_filename:'example.js',filename:'fixture'},
        'Analyze and save to fixture','fixture','fixture');
    console.log('Analysis contract, coder selection, read-only execution and missing/partial evidence passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
