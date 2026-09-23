# Second-file checked evidence

The user's profile Check/Recall transcript passed live acceptance. The new codeEvidence Learn/Recall worked, but its interpretation incorrectly accepted a short coverage hash and invented truncation for small input. The failed Check was expected: only the profile file had been registered then.

## Implemented

Added a developer-maintained `evidenceContracts.js` registry shared by the collector and isolated runner. It currently registers exactly two files. Runner/fixture paths are resolved from this registry, never from arbitrary user/model paths. Dependency fingerprints include the registry, runner, collector and the selected source/fixtures. Evidence must match both source identity and version; one file's outcomes cannot substitute for another's.

`codeEvidence.js` has seven fixed authored scenarios:

- Short (16-character) hash: coverage null; small input unchanged.
- Valid 64-character hash and nextLine: coverage retained; small input unchanged.
- Wrong tool or non-tool provenance: capture returns null.
- Different agent: follow-up rejected; same-agent matching follow-up returns original evidence.
- Exact 600000 ms age: accepted. Age 600001: rejected.
- Continuation wording matches; an explanation referencing that code also reuses evidence without being a pagination command; unrelated topic does not.
- Oversized final line: omitted entirely, preserving the previous complete line and truncation marker.

The same Check/Recall/storage path now handles both files. Counts and scope descriptions follow the selected contract. Unsupported files report that no approved checks exist before asking for learning. No new model run, global model change, source behavior change, migration or production memory mutation was performed. These checks establish only their fixed outcomes, not general model understanding.

## Verification

The isolated seven-case runner passed. Targeted collector and real conversation tests passed for both files, including cross-file evidence rejection, incorrect fixture output rejection, separate records and no model calls during Check/Recall. The full offline suite passed **94/94 files**, recorded in `backend/.local/second-file-evidence-tests.log`. Syntax and whitespace checks passed.

## Live acceptance

Restart the backend. The user's existing learned codeEvidence record is sufficient:

1. `Check Atlas file src/core/codeEvidence.js`
2. `Recall Atlas file src/core/codeEvidence.js`

Expect **7 fixed checks passed**, saved to database, and the same observations on recall. In particular, the short-hash observation should show `coverage: null` and `textUnchanged: true`.

The shared check implementation changed, so previously stored profile checks will correctly be marked stale. To refresh that evidence, run `Check Atlas file src/agents/agentProfiles.js` once; relearning is unnecessary unless the source changed.

No SQL or settings changes are needed. No commits made.
