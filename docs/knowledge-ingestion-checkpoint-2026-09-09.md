# Guarded knowledge ingestion — 2026-09-09

Follow-up: controlled administrative resolution is now implemented in migration 012 and its CLI; the user confirmed that migration and SQL assertions succeeded. See `knowledge-review-resolution-2026-09-09.md`. The chronology below describes the completed migration-011 checkpoint; automatic or conversational approval remains disabled.

## Why this pass was needed

Exact category/subject/key matches skipped semantic comparison and could replace an unverified value automatically. Detected conflicts were returned to the caller but not durably retained for review. Application-side reads also could not guarantee the row was unchanged when the later upsert ran.

## Implemented

- Migration `011_knowledge_ingestion_review.sql` adds the `knowledge_ingestion_reviews` queue and `ingest_knowledge_candidate` transaction function. This is an inbox of incoming proposals, not another canonical knowledge library. Existing cleanup-event and verification-run tables have different purposes; they do not represent unsaved ingestion proposals.
- New identities insert provisionally. The function ignores attempts to grant verification through the candidate payload.
- Duplicate refreshes preserve the canonical value, type, verification evidence, freshness deadline, and established source. Semantic equivalents require a matching expected snapshot before refreshing.
- Changed values, stale comparisons, and writes targeting superseded/contradicted/pending-verification records are held for review. **Even a model-classified knowledge update does not automatically replace a changed canonical value in this pass.** Verified replacement remains the separate reverification workflow; explicit review resolution is future work.
- Record locking and `INSERT ... ON CONFLICT DO NOTHING` protect this ingestion path against overwrites from concurrent arrivals. The expected snapshot checks id, value, update timestamp, verification status, and verification-attempt count.
- Review items retain the incoming candidate and expected/current snapshots. Repeated identical proposals reuse a queue item and increment its occurrence count. Review items are not included in trusted knowledge retrieval.
- Table access and function execution are limited to the service role; row-level security is enabled and the function uses invoker privileges.
- `knowledgeIngestion.js` handles decision-to-write mapping; `knowledgeIngestionRepository.js` handles the database boundary. Removed duplicate knowledge-write branches from the main memory manager.
- Knowledge comparisons preserve case-sensitive units. Other memory-bank write policies are unchanged.
- Mixed results report saved-with-conflicts, and background search extraction reports queued reviews or duplicate refreshes instead of misleadingly saying nothing was extracted.

No existing production record was changed, deleted, merged, or reverified by this task during implementation. The user confirmed that migration 011 and its rollback-only SQL assertion test both completed successfully. A subsequent live read-only queue check succeeded and returned zero pending reviews.

## Follow-up safety and inspection

- `knowledgeVerificationWrites.js` now claims and finishes verification through conditional updates matching id, value, updated timestamp, status, and attempt count. A competing worker or changed record causes the stale write to fail instead of overwriting newer state.
- The verification service refuses duplicate pending attempts and superseded records. Failure cleanup only writes through a confirmed claim, and cannot undo a result already saved successfully.
- The review CLI can inspect one proposal, its saved snapshots, and the current canonical record. It highlights changed snapshot fields but never grants permission to accept a proposal. These reads are diagnostic, not a transaction or substitute for a conditional resolution write.
- These follow-up changes require no additional migration.

## Validation

All 29 targeted local test files passed. Coverage includes repository arguments/errors, missing-migration failure, manager queue outcomes, mixed results, case-sensitive unit protection, semantic equivalent snapshots, verification ownership and late failures, read-only review inspection, and the earlier canonicalization/retrieval/verification/cleanup tests.

The local migration test is structural and verifies that the fresh schema contains the same SQL. It does not execute PostgreSQL. No running local PostgreSQL instance was available; Docker's daemon was not running. The user separately ran the SQL transaction test successfully in Supabase. Verification ownership concurrency tests use a stateful repository mock, not competing live database clients.

## Completed user SQL steps

The user has completed the following; no rerun is requested:

1. Run `backend/src/database/migrations/011_knowledge_ingestion_review.sql` in the Supabase SQL editor. Do not rerun the entire base schema on the existing database.
2. Run `backend/tests/sql/knowledgeIngestion.sql` in a separate SQL-editor query. It tests provisional insertion, verified duplicate preservation, units, review deduplication, stale snapshots, conflicting insert behavior, and superseded-record protection using one unique synthetic identity.
3. Report success or paste the error. The user reported success for both queries. The test rolls back all table changes; generated sequence numbers can advance.

Do not restart and perform knowledge-ingestion tests before applying 011: the new write path intentionally fails rather than falling back to the unsafe upsert if the function is missing.

After migration and SQL validation, the queue can be inspected read-only from `backend`:

```powershell
npm run knowledge:ingestion-review
```

An empty queue is expected if no proposals have subsequently been ingested. This command lists at most the 50 most recent pending items; the count is the returned page size, not an unbounded total.

To inspect a returned **review ID** (not a knowledge-record ID):

```powershell
npm run knowledge:ingestion-review -- --id <review-id>
```

Missing review IDs return `found: false`. Unknown flags, including approval flags, are rejected. The output may contain private knowledge text and is intended for local review.

## Remaining limits

The SQL test simulates stale state but is not a concurrent two-client stress test. Direct administrative writes remain separate from ingestion; verification now has its own conditional ownership checks. A process crash can leave a pending verification: automatic recovery/leases are not implemented, and retries deliberately refuse to steal pending ownership. Record application and verification-run audit completion are not one transaction; an audit failure after a successful application preserves the saved result and reports failure rather than undoing it. Non-knowledge conflicts are not made durable by this migration. Semantic classification still has the five measured errors documented in the canonicalization evaluation checkpoint. The queue has no automated approval or user-facing resolution tool yet; review policy and resolution should be designed before queued proposals can modify canonical claims.
