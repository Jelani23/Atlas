# Checked project evidence: live acceptance checkpoint

## New end-to-end path

`Check Atlas file src/agents/agentProfiles.js` runs exactly five developer-authored offline scenarios and attaches their actual results to the existing project-understanding record. It requires a learned record for the current source version. The existing `readCode` and `runTests` permissions apply; ordinary Learn/Recall never run tests. Other files are explicitly unsupported in this slice.

The registered runner uses a separate hidden Node process, no shell, an environment without database credentials, disabled fetch, injected clock/client/seeds, a 15-second timeout, bounded output and cancellation. It is an allowlisted trusted repository check, not an OS sandbox for arbitrary code. Model output and user text cannot choose executable code, test paths or shell commands. No generated tests run.

Source, seed module, fixed scenario file, runner and collector implementation are hashed before and after execution. Changed dependencies discard results. Recall checks those hashes again; it does not rerun tests or call a model. Record identity and existing database constraints remain unchanged. The new `checkedEvidence` field fits the existing JSON record, so no migration is required. Overall record status stays `interpretation_unverified`; only the five observed outcomes are checked.

When current checked evidence exists, recall displays those observations rather than repeating the earlier speculative predictions. Those earlier interpretations remain in the record; they are not silently marked verified. Source changes require relearning; changed test dependencies require rechecking. Relearning creates a new interpretation without carrying old checked evidence forward. This is still one-file evidence, not module-wide understanding or automatic background learning.

## Actual observations covered

1. Incomplete profile throws `Invalid agent profile shape`.
2. Syntactically valid ID `invalid`, no seed/cache and failed database read: explicit profile-unavailable error.
3. Database cache at age 29999 ms with 30000 ms TTL: `database`, degraded false, revision 7; zero database calls during the second get.
4. Database cache at exact expiry and failed refresh: `cached_database`, degraded true, revision 7; one database call.
5. Seed-origin cache at exact expiry and failed refresh: `seed_fallback`, degraded true, revision null; one database call.

Each observation includes its precise setup/action. These are outcomes from the real profile-store code under injected conditions, not claims about the live Supabase service.

## Model explanation gate

One sequential local coder run received the executed results and source. It copied the five observed objects exactly but still supplied false prose: called a fresh cache empty, said the database was not called at expiry, and repeated the invalid-ID confusion. Report: `backend/.local/checked-evidence-audits/1790117952980.json`.

`profileEvidence.explain` retains a comparison guard for omitted/changed observed objects, timeouts and provider failures, but **that guard is insufficient to certify prose**. It remains audit-only. The runtime Check command therefore makes no model call, and model commentary is withheld from display/recall even if present in an audit record. The result is a reliable observed-evidence path, not a claim that Alice's causal reasoning improved.

## Validation

- 94/94 offline files passed. After disabling runtime model explanation, targeted evidence and real conversation tests passed again; database JSON attachment and stale recall were then checked in targeted tests.
- Real isolated runner outcomes match the fixed expected values.
- Tests cover explicit authorization/permissions, unsupported files, stale source/dependencies, incomplete results, model-output contradictions, failure/timeout preservation, failed saves and cancellation.
- Real conversation engine coverage includes Learn → Check → Recall with no model generation during Check/Recall; stale checked evidence is withheld.
- Database schema attachment tested with isolated PostgreSQL/WASM. No production records were changed in development, no SQL run, no commits made.

## Live acceptance

Restart the backend, then:

1. `Check Atlas file src/agents/agentProfiles.js`
2. `Recall Atlas file src/agents/agentProfiles.js`

The first should say **Saved checked evidence to database project understanding** and show five passing fixed checks with the exact observed fields above. The second should show the same checked results, not the earlier incorrect predictions. Model explanations are intentionally withheld. If it requests learning the current source first, use the existing Learn command once, then Check again.

No new migration or configuration setting is needed. This acceptance executes only the five registered offline scenarios and saves their evidence to the existing record.

Next work after acceptance: evaluate explanations with claim-level, source-backed checks instead of assuming exact copying of results validates the reasoning. Keep the observation layer authoritative and separate; do not broaden to autonomous scanning while the explanation gate fails.
