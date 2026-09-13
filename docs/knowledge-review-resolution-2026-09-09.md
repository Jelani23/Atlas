# Controlled knowledge-review resolution

## Implemented and database assertions validated

The user confirmed successful execution of migration 012 and the rollback-only SQL assertion test. The subsequent live read-only queue check succeeded and returned zero pending reviews. No production proposal was resolved as part of these checks.

Migration `012_knowledge_review_resolution.sql` extends the existing review table with decision action, reason, timestamp, and before/after canonical-record snapshots. It does not add another table or rewrite existing knowledge claims.

The administrative CLI previews a single review and optionally saves the complete preview to a new local JSON file. A separate explicit apply command submits that saved snapshot. PostgreSQL locks the canonical record and review, checks both full snapshots, and applies the decision and audit fields in one transaction. Changed records or new arrivals invalidate an old preview. Resolved reviews cannot be applied again.

Supported actions:

- `dismiss`: close the proposal without changing knowledge. The proposal remains stored.
- `accept_provisional`: replace the value of the same existing canonical identity, only when its current status is `needs_source`, `unverified`, or `failed`. No missing target insertion, identity reassignment, or replacement of verified/pending/contradicted/superseded records is permitted here. Verification remains a separate operation.

Acceptance clears the displaced claim's evidence, verification dates, freshness deadline, topic tags, and confidence. The new value remains unverified (or needs a source); it cannot inherit verification from the old claim or the candidate payload. Original fields remain in the review's before snapshot. Update September 11: conditional undo is implemented in migration 013, which the user confirmed applied and SQL-tested. It requires the replacement to remain unchanged and restores the old claim without old trust. Topic regeneration remains unimplemented. See `memory-workflow-status.md` for the current maintenance workflow.

Pending proposals deduplicate as before. If the same proposal arrives after dismissal/resolution, it creates a new pending review and preserves the earlier decision. Repeated arrivals can therefore need another decision; this is not a permanent suppression rule.

No conversational tool routes or automatic approvals were added. No live proposal was accepted or dismissed during development.

## Completed user database checks

These were run separately in Supabase SQL Editor, in order; no rerun is needed:

1. `backend/src/database/migrations/012_knowledge_review_resolution.sql`
2. `backend/tests/sql/knowledgeReviewResolution.sql`

The second query creates a uniquely named synthetic record and rolls all table changes back. Sequence counters may advance. It tests stale previews, repeat arrival/history preservation, verified and pending target protection, provisional replacement, cleared evidence, and replay rejection. Do not rerun the base schema or older migrations.

Local JavaScript tests cover preview validation, RPC parameters/errors, CLI arguments, and structural schema synchronization. These do not execute PostgreSQL or prove two-client concurrent behavior. The user separately confirmed successful Supabase SQL execution.

## Later operator workflow — not requested for current validation

From `backend`, list pending reviews:

```powershell
npm run knowledge:ingestion-review
```

Use a returned **review ID**, not a knowledge-record ID. Preview and save to a new file in an existing private local directory:

```powershell
npm run knowledge:review-resolve -- --review <review-id> --action dismiss --reason "Reason for decision" --out <new-plan.json>
```

Review the complete JSON, including current and proposed values. For a replacement use `accept_provisional` instead of `dismiss`. Existing output files are never overwritten. These files contain private memory text and should not be committed.

Only after explicitly approving the saved decision:

```powershell
npm run knowledge:review-resolve -- --apply <reviewed-plan.json>
```

Restart a running Atlas backend before checking recall following CLI writes: a separate process cannot invalidate Atlas's in-memory cache. A stale-preview error requires a new preview and review; the CLI does not auto-refresh approval or force a retry. An uncertain response requires inspecting the review before retrying.
