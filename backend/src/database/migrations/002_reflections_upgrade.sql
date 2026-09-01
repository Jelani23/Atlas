-- backend/src/database/migrations/002_reflections_upgrade.sql
--
-- Upgrades `reflections` from its original minimal shape:
--
--     id, session_id, summary, timestamp
--
-- to carry the same retrieval metadata (category/subject/topics) already
-- established by knowledge_library (see 001_knowledge_library_upgrade.sql),
-- so contextManager.js can score and retrieve reflections the same
-- deterministic keyword/topic-overlap way it already scores every other
-- memory store.
--
-- IMPORTANT — this is intentionally a much thinner table than
-- knowledge_library, on purpose:
--
--   knowledge_library = durable, individually-addressable facts/claims
--   about the world, identified by (category, subject, key), upserted
--   and updated over time.
--
--   reflections = one row per conversation session, a compact summary of
--   what happened in THAT session, written for Alice's own future
--   reference rather than as a standalone fact. There is no `key` and no
--   `value` here on purpose — a reflection is not a fact lookup, it's a
--   session-scoped observation. `category`/`subject`/`topics` exist only
--   so it can be *found* the same way other memory is found, not so it
--   can be queried as a knowledge fact.
--
-- Safe to re-run: every ADD COLUMN uses IF NOT EXISTS, no existing row is
-- ever deleted or altered beyond receiving default values.

alter table reflections
    add column if not exists category text not null default 'general';

alter table reflections
    add column if not exists subject text not null default 'general';

alter table reflections
    add column if not exists topics text[] not null default '{}';

-- How confident the reflection engine was in the pattern it extracted,
-- same convention/scale as knowledge_library.confidence. A session that
-- produced a clean, unambiguous pattern gets a high score; a fallback
-- summary (see reflectionEngine.js's parse-failure path) gets a low one
-- so retrieval can deprioritize it without deleting it.
alter table reflections
    add column if not exists confidence double precision not null default 1.0;

-- ─────────────────────────────────────────────────────────────
-- Indexes for retrieval — same shape as knowledge_library's.
-- ─────────────────────────────────────────────────────────────

create index if not exists idx_reflections_category on reflections(category);
create index if not exists idx_reflections_subject on reflections(subject);
create index if not exists idx_reflections_topics on reflections using gin(topics);

-- One reflection per session — the dedup guard in reflectionEngine.js
-- checks this before generating, but the constraint is the actual
-- backstop against a race (e.g. shutdown() and newConversation() both
-- firing for the same outgoing session).
create unique index if not exists idx_reflections_session_unique
    on reflections(session_id)
    where session_id is not null;
