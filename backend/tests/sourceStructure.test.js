const assert=require('node:assert/strict');
const {extractStructure}=require('../src/reasoning/sourceStructure');
function source(code) {return {path:'src/example.js',complete:true,text:code.split('\n').map((line,i)=>`${i+1}: ${line}`).join('\n')};}
const map=extractStructure(source(`// function invented() {} require('fake')
const text = "if (fake) throw Error()";
const dep = require('./dep');
function outer(value = 0) {
  if (value < 0) throw new Error('negative');
  const inner = () => { return 2; };
  return value;
}
module.exports = {outer};`));
assert.equal(map.status,'parsed');
assert.deepEqual(map.entries.filter(e=>e.kind === 'function').map(e=>[e.owner,e.line,e.endLine]),[['outer',4,8],['inner',6,6]]);
assert.deepEqual(map.entries.filter(e=>e.kind === 'return').map(e=>[e.owner,e.line]),[['inner',6],['outer',7]]);
assert.equal(map.entries.filter(e=>e.kind === 'require-expression').length,1);
assert.equal(map.entries.find(e=>e.kind === 'if-condition').detail,'value < 0');
assert.equal(map.entries.find(e=>e.kind === 'throw').line,5);
assert.equal(map.entries.find(e=>e.kind === 'export-assignment').line,9);
assert.equal(extractStructure(source('function {')).status,'parse_error');
assert.throws(()=>extractStructure({...source('const x=1'),complete:false}),/complete/);
assert.throws(()=>extractStructure({path:'src/a.js',complete:true,text:'2: const x=1'}),/Noncontiguous/);
const many=extractStructure(source(Array.from({length:100},(_,i)=>`function f${i}(){return ${i};}`).join('\n')));
assert(many.truncated);assert(many.entries.length<=40);
assert.equal(extractStructure({...source('{}'),path:'src/a.json'}).status,'not_applicable');
console.log('Source structure: syntax locations, nested ownership, comments/strings, bounds and partial-source handling passed.');
