require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const sessionManager = require('../src/memory/sessionManager');

async function run() {
    const sessionIds = process.argv.slice(2)
        .map(value => Number(value))
        .filter(Number.isInteger);

    if (sessionIds.length === 0) {
        throw new Error('Usage: npm run reflection:requeue -- <session-id> [session-id...]');
    }

    for (const sessionId of sessionIds) {
        const result = await sessionManager.requeueReflection(sessionId);
        console.log(
            `Session ${result.sessionId} queued (${result.messageCount} messages).`
        );
    }
}

run().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
