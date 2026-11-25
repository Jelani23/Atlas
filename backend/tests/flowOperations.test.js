const assert=require('node:assert/strict');
const ts=require('typescript');
const {createInputInventory}=require('../src/reasoning/functionInputs');
const {regexSome,lengthCondition}=require('../src/reasoning/flowOperations');
function inspect(expression,setup='const patterns=[/red/i,/blue/];',params='text'){
    const ast=ts.createSourceFile('fixture.js',setup+`function inspect(${params}){return ${expression};}`,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n));
    const span=n=>({start:n.getStart(),end:n.end,line:1,path:'fixture.js'});
    const node=fn.body.statements[0].expression;
    return {node,fact:regexSome(node,createInputInventory(ast,span)(fn),span)};
}
const negative=inspect('!patterns.some(p=>p.test(text))').fact;
assert(negative.negated);assert.equal(negative.input,'text');assert(negative.declarationSpan);
assert.equal(inspect('patterns.some(p=>p.test(text))').fact.negated,false);
assert(inspect('!patterns.some(p=>p.test(text))','const patterns=[];').fact);
for(const [expr,setup,params] of [
    ['!patterns.some(async p=>p.test(text))'],
    ['!patterns.some(p=>p.test(p))'],
    ['!patterns.some(p=>p.test(text))','const patterns=[/red/g];'],
    ['!patterns.some(p=>p.test(text))','const patterns=[/red/y];'],
    ['!patterns.some(p=>p.test(text))','const patterns=[custom];'],
    ['!patterns.some(p=>p.test(text))','const patterns=[/red/];patterns.push(/blue/);'],
    ['!patterns.some(p=>p.test(text))','const patterns=[/red/];patterns[0]=custom;'],
    ['!patterns.some(p=>p.test(text))',undefined,'text,patterns'],
    ['!patterns?.some(p=>p.test(text))'],
    ['!patterns.some((p,index)=>p.test(text))'],
    ['!patterns.some(p=>p.test(text))','const patterns=[/red/];module.exports={x:patterns.pop()};']
])assert.equal(inspect(expr,setup,params).fact,null,expr+' '+setup);
for(const [op,phrase] of [['<','less than'],['<=','at most'],['>','greater than'],['>=','at least'],['===','equal to'],['!==','not equal to']])assert.equal(lengthCondition(inspect(`text.length ${op} 20`).node,new Set(['text'])),`text’s length is ${phrase} 20`);
assert.equal(lengthCondition(inspect('text.length < 20').node,new Set()),null);
// Authored fixed oracles: no fixture source or source regex is executed.
const patterns=[/red/i,/blue/];let visits=0;
assert.equal(!patterns.some(p=>{visits++;return p.test('RED');}),false);assert.equal(visits,1);
assert.equal(!patterns.some(p=>p.test('green')),true);
assert.equal(![].some(()=>true),true);
console.log('Flow operations preserve comparison boundaries, negation, first match and conservative exclusions.');
