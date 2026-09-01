-- backend/src/database/migrations/003_conversations_upgrade.sql
--
-- Adds structured retrieval metadata to `conversations` (the canonical
-- chat log - see workingMemory.js/sessionManager.js), following the same
-- topics-as-retrieval-metadata convention already established by
-- knowledge_library (001) and reflections (002).
--
-- IMPORTANT — scope, on purpose:
--
-- This does NOT turn every message into a semantic memory record. No
-- key/value, no category, no confidence. A chat message stays exactly
-- what it is - one turn of the actual conversation - with a thin layer
-- of retrieval metadata bolted on so the context system can find an
-- older-but-relevant message without relying only on recency (plan §10).
--
-- `topics` is populated deterministically (see
-- utils/keywordExtractor.js, shared with contextManager.js's own
-- scoring) - NOT by an extra LLM call per message. It reuses whatever
-- the existing per-turn memory-extraction pass already computed, so
-- this adds no new model calls to the pipeline (plan §4: deterministic
-- where possible).
--
-- `project_key` mirrors project_memory's own column so a message can be
-- scoped to the project that was active when it was sent, without
-- guessing from content.
--
-- `importance` is a coarse deterministic signal - not a subjective
-- score, not LLM-assigned. It's set from what the extraction pass
-- already learned about the message: did it produce a saved memory,
-- was it flagged eligible at all. See conversationEngine.js's tagging
-- call.
--
-- Safe to re-run: every ADD COLUMN uses IF NOT EXISTS, no existing row
-- is destroyed. Existing rows backfill to empty/zero defaults - this is
-- an additive, backward-compatible pass; there is no deterministic way
-- to reconstruct topics for historical messages after the fact without
-- re-running extraction on them, so old rows simply start with no
-- metadata rather than a fabricated backfill. If you want it, rerunning
-- eligibility+extraction over old conversations is a separate,
-- explicit backfill job, not part of this migration.

alter table conversations
    add column if not exists topics text[] not null default '{}';

alter table conversations
    add column if not exists project_key text;

alter table conversations
    add column if not exists importance smallint not null default 0;

create index if not exists idx_conversations_topics on conversations using gin(topics);
create index if not exists idx_conversations_project_key on conversations(project_key);

-- Composite index for the common retrieval query this metadata exists to
-- support: "relevant messages for project X, most important/newest
-- first" - see workingMemory.getRelevant().
create index if not exists idx_conversations_project_importance
    on conversations(project_key, importance desc, "timestamp" desc);
