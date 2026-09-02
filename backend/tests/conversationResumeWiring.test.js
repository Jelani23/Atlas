const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, '../..', relativePath), 'utf8');
}

const server = read('backend/src/server.js');
const atlasInterface = read('backend/src/interface/atlasInterface.js');
const electronMain = read('electron/main.js');
const preload = read('electron/preload.js');
const bridgeTypes = read('renderer/lib/atlas-events.ts');
const app = read('renderer/components/atlas-app.tsx');
const conversations = read('renderer/components/conversations-view.tsx');

for (const [name, source] of [
    ['server', server],
    ['Atlas interface', atlasInterface],
    ['Electron main', electronMain],
    ['preload bridge', preload],
    ['renderer bridge types', bridgeTypes],
    ['Atlas app', app]
]) {
    assert(source.includes('resumeConversation'), `${name} is missing resumeConversation wiring.`);
}

assert(
    conversations.includes('Continue conversation'),
    'Past conversations need a visible continue action.'
);
assert(
    atlasInterface.includes('_closeCurrentConversation'),
    'New and resumed conversations should share the same close/reflection lifecycle.'
);

console.log('conversationResumeWiring.test.js: all assertions passed');
