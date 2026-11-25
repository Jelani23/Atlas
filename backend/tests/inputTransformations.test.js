const assert=require('node:assert/strict');
const ts=require('typescript');
const {createInputInventory}=require('../src/reasoning/functionInputs');
const {describeTransformation,explainTransformation}=require('../src/reasoning/inputTransformations');
function inspect(body,prefix='',parameters='value'){
    const ast=ts.createSourceFile('fixture.js',prefix+`\nfunction inspect(${parameters}){const text=${body};if(!text)return null;return text;}`,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n));
    const inventory=createInputInventory(ast,n=>({start:n.getStart(),end:n.end}))(fn);
    return describeTransformation(fn.body.statements[0].declarationList.declarations[0].initializer,inventory);
}
const normalized=inspect("String(value || '').trim()");
assert.equal(normalized.fallback,true);assert.equal(normalized.trim,true);assert.equal(normalized.resultType,'string');
assert.match(explainTransformation(normalized,'text'),/falsy.*both ends/);
const direct=inspect('String(value)');assert.equal(direct.fallback,false);assert.equal(direct.trim,false);
assert.doesNotMatch(explainTransformation(direct,'text'),/empty string/);
for(const fact of [inspect("String(value || '')",'', 'value,String'),inspect("String(value || '')",'const String = custom;'),inspect("String(value || '')",'globalThis.String = custom;'),inspect("String(value || '')",'Object.defineProperty(globalThis,"String",{});'),inspect("String(value || '')",'eval("anything");'),inspect('String(value ?? "")'),inspect('String(value).toLowerCase()'),inspect('String?.(value)'),inspect('new String(value)'),inspect('String(...value)')])assert.equal(fact,null);
// Fixed standard-operation oracle, not analyzed or generated code execution.
const fallback=value=>String(value||'').trim();
assert.equal(fallback(false),'');assert.equal(fallback(0),'');assert.equal(fallback(NaN),'');
assert.equal(fallback('  red blue  '),'red blue');assert.equal(fallback('red  blue'),'red  blue');
assert.equal(String(null),'null');assert.equal(String(false),'false');
console.log('Conditional transformations: falsy fallback, conversion, trimming, binding and mutation exclusions passed.');
