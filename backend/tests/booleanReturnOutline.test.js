const assert=require('node:assert/strict');
const ts=require('typescript');
const {deriveBooleanReturn,presentBooleanReturn}=require('../src/reasoning/booleanReturnOutline');
function outline(text){
    const ast=ts.createSourceFile('fixture.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    return deriveBooleanReturn(ast.statements[0],n=>({path:'fixture.js',line:1,start:n.getStart(ast),end:n.end}));
}
const disjunction=outline('function f(a,b){return !a || b === "length";}');
assert.equal(disjunction.condition.kind,'or');
assert.equal(disjunction.condition.left.kind,'falsy');
assert.equal(disjunction.condition.right.kind,'equal');
assert.match(presentBooleanReturn(disjunction)[0].text,/Otherwise, it returns false/);
assert.match(presentBooleanReturn(disjunction)[1].text,/only when the left is false/);
const conjunction=outline('function f(a,b){return a !== 0 && !b;}');
assert.equal(conjunction.condition.kind,'and');
assert.equal(conjunction.condition.left.kind,'unequal');
assert.match(presentBooleanReturn(conjunction)[1].text,/only when the left is true/);
const grouped=outline('function f(a,b,c){return (!a || !b) && !c;}');
assert.equal(grouped.condition.left.kind,'or');
assert.match(presentBooleanReturn(grouped)[0].text,/\) or \(.*\)\) and \(/);
assert.match(presentBooleanReturn(outline('async function f(a){return !a;}'))[0].text,/promise that fulfills with true/);
assert.match(presentBooleanReturn(outline('function f(){return false;}'))[0].text,/returns false/);
for(const source of [
    'function f(a,b){return a || b;}', // Operand return is not necessarily Boolean.
    'function f(a,b){return !a && b;}',
    'function f(a){a=0;return !a;}',
    'function f(a){if(a)return true;return false;}',
    'function f(a=sideEffect()){return !a;}',
    'function* f(a){return !a;}',
    'function f({a}){return !a;}'
])assert.equal(outline(source),null,source);
// Authored fixed oracle, not code compiled from source or model output.
function oracle(a,b){return !a || b === 'length';}
for(const [a,b,expected] of [['','stop',true],['ok','length',true],['ok','stop',false],['','length',true]]){
    const rule=disjunction.condition;
    const left=!a,right=b==='length';
    assert.equal(rule.kind==='or'&&(left||right),oracle(a,b));
    assert.equal(oracle(a,b),expected);
}
console.log('Boolean return outlines preserve grouping, types, polarity, async outcomes and unsupported boundaries.');
