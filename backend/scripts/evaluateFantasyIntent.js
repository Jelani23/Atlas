require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env') });
const assert = require('node:assert/strict');
const cases = require('../tests/fixtures/fantasyIntentCases');
const { resolve } = require('../src/integrations/espnFantasyIntent');
(async () => {
    let failures = 0;
    for (const [message, history, expected, expectedParameters] of cases) {
        const result = await resolve(message, history);
        const actual = result?.kind === 'read' ? result.actions : result?.kind || null;
        try { assert.deepEqual(actual, expected); if(expectedParameters) for(const [key,value] of Object.entries(expectedParameters)) assert.deepEqual(result.parameters?.[key],value); }
        catch { failures++; }
        console.log(JSON.stringify({ message, expected, actual, ...(expectedParameters?{expectedParameters,parameters:result?.parameters}:{}) }));
    }
    console.log(`${cases.length - failures}/${cases.length} live local-model routing cases passed.`);
    process.exitCode = failures ? 1 : 0;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
