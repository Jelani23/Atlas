const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Conversation listing is a read operation. A previous implementation called
// pruneEmptySessions(), which loaded a capped set of conversation rows and then
// deleted every session missing from that partial result. Once the table grew
// beyond Supabase's response cap, valid recent sessions were deleted with their
// messages via ON DELETE CASCADE.
function run() {
    const interfaceSource = fs.readFileSync(
        path.join(__dirname, '../src/interface/atlasInterface.js'),
        'utf8'
    );
    const sessionSource = fs.readFileSync(
        path.join(__dirname, '../src/memory/sessionManager.js'),
        'utf8'
    );

    const listMethod = interfaceSource.match(
        /async listConversations\(\)\s*\{[\s\S]*?\n\s*\}/
    )?.[0] || '';

    assert(listMethod, 'Could not locate AtlasInterface.listConversations().');
    assert(
        !/prune|delete/i.test(listMethod),
        'Listing conversations must never prune or delete stored sessions.'
    );
    assert(
        !/pruneEmptySessions/.test(sessionSource),
        'The unsafe client-side empty-session pruning helper must not return.'
    );

    const sessionDeletes = sessionSource.match(
        /from\('sessions'\)\.delete\(\)/g
    ) || [];
    assert.strictEqual(
        sessionDeletes.length,
        1,
        'Session deletion must exist only in the explicit deleteConversation path.'
    );

    console.log('conversationRetention.test.js: all assertions passed');
}

run();

