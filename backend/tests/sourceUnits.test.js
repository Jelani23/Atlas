const assert = require('node:assert/strict');
const { sourceUnits } = require('../src/reasoning/evidencePilot/sourceUnits');
const source = `function handle(previous) {
    if (previous) {
        previous.superseded = true;
        if (previous.deep) cancel(previous);
    }
    try {
        if (previous.deep) {
            try { if (cancelled()) throw new Error('cancelled'); }
            catch (error) { record(error); }
            if (cancelled()) return '';
            return send();
        }
    } catch (outer) { recover(outer); }
    finally { cleanup(); }
}`;
const result = sourceUnits('sample.js', source, { focus: ['cancel'] });
const whole = result.units.find(u => u.label === 'handle');
assert.equal(whole.text, source);
const previous = result.units.find(u => u.label === 'if (previous)');
assert(previous.text.includes('if (previous.deep) cancel(previous)'));
const branch = result.units.find(u => u.label === 'if (previous.deep)');
assert(branch.text.includes('catch (error)'));
assert(branch.text.includes("if (cancelled()) return ''"));
assert(branch.enclosing.some(e => e.kind === 'try' && e.catch && e.finally));
assert(branch.enclosing.some(e => e.kind === 'function' && e.partial));
for (const unit of result.units) assert.equal(source.slice(unit.start, unit.end), unit.text);
assert.equal(sourceUnits('bad.js', 'function broken( {').units.length, 0);
console.log('Source units: whole guard/catch/cleanup blocks, exact spans and omitted enclosing handlers passed.');
