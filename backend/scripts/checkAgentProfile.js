// Read-only deployment check. Does not create or repair rows.
require('dotenv').config({ quiet: true });
const { getAgentProfile } = require('../src/agents/agentProfiles');
getAgentProfile().then(snapshot => {
    console.log(JSON.stringify({ agentId: snapshot.agentId, source: snapshot.source,
        revision: snapshot.revision, degraded: snapshot.degraded, reason: snapshot.reason || null }, null, 2));
    if (snapshot.source !== 'database') process.exitCode = 1;
}).catch(error => { console.error(error.message); process.exitCode = 1; });
