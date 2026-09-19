const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const filename = require.resolve('../src/core/sourceReader');
const root = path.resolve(path.dirname(filename), '../..');
let content = Array.from({length: 250}, (_, i) => `const line${i + 1} = ${i};`).join('\n');
let tree = ['src/example.js'];
let redirect = false;
let oversized = false;
const moduleStub = {exports: {}};
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: moduleStub, __dirname: path.dirname(filename),
    require: name => name === './projectCache' ? {getTree: () => tree} : name === 'fs' ? {
        realpathSync: value => redirect && path.extname(value) ? path.join(root, 'secret.js') : value,
        statSync: () => ({isFile: () => true, size: oversized ? 2000000 : content.length}),
        readFileSync: () => content
    } : require(name)
});
const {readRange, formatRange} = moduleStub.exports;
let page = readRange('example');
assert.equal(page.endLine, 80);
assert.equal(page.nextLine, 81);
assert.equal(page.complete, false);
assert.match(formatRange(page), /81, 80/);
const second = readRange('src/example.js', 81, 80, page.version);
assert.equal(second.startLine, 81);
assert.match(second.text, /^81: const line81/);
content += '\nchanged';
assert.throws(() => readRange('src/example.js', 81, 80, page.version), /Source changed/);
for (const bad of ['../src/example.js', 'C:\\secret.js', 'src/../../secret.js', '.env', 'src/secret.env']) assert.throws(() => readRange(bad));
for (const args of [[0, 80], [1, 201], [1.5, 2], [999, 1]]) assert.throws(() => readRange('src/example.js', ...args));
tree.push('src/other/example.js');
assert.throws(() => readRange('example'), /Ambiguous/);
redirect = true;
assert.throws(() => readRange('src/example.js'), /outside/);
redirect = false;
oversized = true;
assert.throws(() => readRange('src/example.js'), /1 MiB/);
oversized = false;
content = '';
assert.equal(readRange('src/example.js').complete, true);
content = 'x'.repeat(10000);
page = readRange('src/example.js');
assert.equal(page.clippedLine, 1);
assert.equal(page.complete, false);
assert.equal(page.nextLine, null);
assert(page.text.length <= 8000);
content = 'one\r\ntwo\r\n';
assert.equal(readRange('src/example.js').totalLines, 2);
const tool = require('../src/tools/files/readCode');
assert.deepEqual(tool.intentSchema.extractParams('Read the code for agentProfiles lines 81-120'), ['agentProfiles', 81, 40]);
assert.deepEqual(tool.intentSchema.extractParams('Read the code for agentProfiles'), ['agentProfiles']);
for (const input of ['Read  out agentProfiles', 'Could you please read out agentProfiles?', 'Open agentProfiles', 'Look at agentProfiles']) {
    assert.deepEqual(tool.intentSchema.extractParams(input), ['agentProfiles']);
}
assert.deepEqual(tool.intentSchema.extractParams('Based on that code, what happens if the database read fails?'), [null]);
console.log('Source ranges, versions, bounds, ambiguous paths, empty files and containment passed.');
