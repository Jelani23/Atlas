// Developer-owned registry. User/model text cannot supply a runner or fixture path.
const CONTRACTS=Object.freeze({
    'src/agents/agentProfiles.js': {
        fixture:'tests/fixtures/focusedProfileCases.js', dependencies:['src/core/atlasState.js'],
        ids:['incomplete-profile','valid-looking-unknown','fresh-cache','exact-expiry','seed-expiry'],
        scope:'Five authored scenarios in an isolated process with injected database/clock/seed state. Not live database behavior or whole-file verification.'
    },
    'src/core/codeEvidence.js': {
        fixture:'tests/fixtures/codeEvidenceCases.js', dependencies:[],
        ids:['short-hash','valid-coverage','tool-origin','agent-ownership','expiry-boundary','follow-up-matching','whole-line-truncation'],
        scope:'Seven authored scenarios in an isolated process with synthetic tool results and timestamps. Not live session behavior or whole-file verification.'
    }
});
function contractFor(sourcePath){return Object.hasOwn(CONTRACTS,sourcePath)?CONTRACTS[sourcePath]:null;}
module.exports={contractFor};
