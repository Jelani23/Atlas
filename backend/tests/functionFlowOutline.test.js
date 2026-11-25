const assert=require('node:assert/strict');
const ts=require('typescript');
const {deriveFlowOutline,presentFlowOutline}=require('../src/reasoning/functionFlowOutline');
function outline(text){const ast=ts.createSourceFile('fixture.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);return deriveFlowOutline(ast.statements[0],n=>({path:'fixture.js',line:1,start:n.getStart(),end:n.end}));}
const guards=outline('function choose(a,b){const normalized=adapt(a);if(!normalized)return b;if(!b)return "";return normalized;}');
assert.deepEqual(guards.steps.map(s=>s.kind),['initialize','guard_return','guard_return','return']);
assert.equal(guards.steps[1].value.source,'b');
assert.equal(guards.steps[3].value.source,'normalized');
assert.equal(guards.status,'structural');
assert.equal(guards.fallsThrough,false);
const text=presentFlowOutline(guards).map(c=>c.text).join('\n');
assert.match(text,/Otherwise, execution continues/);
assert.match(text,/returns the value of `normalized`/);
assert.doesNotMatch(text,/adapt.*converts/);
const loop=outline('function scan(x){if(!x)return null;for(const y of x){if(y)return y;}return false;}');
assert.equal(loop.status,'partial');assert.equal(loop.stopped.reason,'ForOfStatement');
assert.equal(loop.steps.length,1);
assert.match(presentFlowOutline(loop).at(-1).text,/continuing paths remain unresolved/);
const fallthrough=outline('function maybe(x){if(x){return 1;}}');
assert.equal(fallthrough.fallsThrough,true);
const asynchronous=outline('async function maybe(x){if(x)return x;return null;}');
assert.match(presentFlowOutline(asynchronous)[1].text,/eventual promise outcome is not derived/);
for(const code of ['function f(x=sideEffect()){if(x)return 1;}','function* f(x){if(x)return 1;}','function f(x){try{if(x)return 1;}finally{cleanup();}}','function f(x){if(x){run();return 1;}}','function f(x){if(x)return 1;else return 2;}'])assert.equal(outline(code),null,code);
// Fixed authored behavior oracle for the complete branch sequence.
function choose(a,b){const normalized=a;if(!normalized)return b;if(!b)return '';return normalized;}
assert.equal(choose('', 'backup'),'backup');assert.equal(choose('ready',''),'');assert.equal(choose('ready','backup'),'ready');
console.log('Flow outlines retain ordered guards, return expressions, partial boundaries and async limitations.');
