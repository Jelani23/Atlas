-- backend/src/database/migrations/001_knowledge_library_upgrade.sql
--
-- Upgrades knowledge_library from its original minimal shape:
--
--     id, subject, key, value, updated_at
--     unique (subject, key)
--
-- into a structured knowledge-memory table that fits the same
-- architectural pattern already established by procedural_memory and
-- project_memory: a layered semantic identity (category/subject/key),
-- topics as non-identity retrieval metadata, and now also a `type`
-- (fact/definition/concept/relationship/observation/claim/assumption/
-- hypothesis) and provenance (source/source_type) so Alice can
-- eventually answer "where did I learn this, and how sure am I".
--
-- Safe to re-run: every ADD COLUMN uses IF NOT EXISTS, the unique
-- constraint swap only runs if the old one is still present, and no
-- existing row is ever deleted. Run this once in the Supabase SQL
-- editor (Project > SQL Editor > New query).

-- ─────────────────────────────────────────────────────────────
-- 1. New columns
-- ─────────────────────────────────────────────────────────────
--
-- `category` here is knowledge's OWN broad domain classification
-- (science, technology, history, programming, general, ...) - not to
-- be confused with the top-level memory-bank discriminator
-- ("project"/"procedure"/"knowledge"/...) used elsewhere in the
-- pipeline. That discriminator never reaches this table at all - by
-- the time a memory is routed here, "which bank" has already been
-- decided. This column answers a different question: within
-- knowledge, what domain is this?
--
-- Existing rows get 'general'/'fact'/'conversation' as sensible
-- defaults for data that predates this schema - Postgres backfills
-- the default into existing rows as part of adding a NOT NULL column
-- with DEFAULT, so no separate UPDATE pass is needed.

alter table knowledge_library
    add column if not exists category text not null default 'general';

alter table knowledge_library
    add column if not exists topics text[] not null default '{}';

-- Intentionally a free-form text column, not a Postgres ENUM: the
-- plan's own instruction is "do not unnecessarily hard-code an
-- inflexible enumeration" - application-level validation (see
-- knowledgeLibrary.js) is where the recommended type vocabulary
-- (fact/definition/concept/relationship/observation/claim/assumption/
-- hypothesis) is enforced, so it can grow without another migration.
alter table knowledge_library
    add column if not exists type text not null default 'fact';

alter table knowledge_library
    add column if not exists confidence double precision not null default 1.0;

-- `source` is a text reference (a URL, a short description, a
-- document name, "user_statement", etc.) rather than jsonb - nothing
-- else in this schema stores structured provenance objects
-- (procedural_memory and project_memory both use plain text columns
-- throughout), and jsonb would be premature structure for what is,
-- for now, just a human/system-readable reference string. If a
-- future acquisition source needs structured provenance (e.g. a web
-- search result with a URL + snippet + retrieval date), that can be
-- layered on without another destructive migration - source stays a
-- pointer, not the payload.
alter table knowledge_library
    add column if not exists source text;

alter table knowledge_library
    add column if not exists source_type text not null default 'conversation';

alter table knowledge_library
    add column if not exists created_at timestamptz not null default now();

-- ─────────────────────────────────────────────────────────────
-- 2. Canonical identity: category + subject + key
-- ─────────────────────────────────────────────────────────────
--
-- The old constraint was (subject, key) only - "science/earth" and
-- "geography/earth" natural_satellite facts would have collided.
-- Every legacy row was just backfilled with category='general', so
-- the old (subject, key) uniqueness guarantee still holds under the
-- new (category, subject, key) constraint - this swap cannot fail on
-- existing data.
--
-- The old constraint's name isn't hardcoded here (Postgres's default
-- auto-generated name would be knowledge_library_subject_key_key,
-- but relying on that guess is exactly the kind of fragile,
-- environment-specific assumption this migration should avoid) -
-- instead this looks up any UNIQUE constraint on knowledge_library
-- whose column set is exactly {subject, key} and drops it by its
-- actual name, whatever that turns out to be.

do $$
declare
    old_constraint_name text;
begin
    select con.conname into old_constraint_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'knowledge_library'
      and con.contype = 'u'
      and (
          select array_agg(att.attname order by att.attname)
          from unnest(con.conkey) as k(attnum)
          join pg_attribute att
              on att.attrelid = con.conrelid
              and att.attnum = k.attnum
      ) = array['key', 'subject']
    limit 1;

    if old_constraint_name is not null then
        execute format(
            'alter table knowledge_library drop constraint %I',
            old_constraint_name
        );
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'knowledge_library_category_subject_key_key'
    ) then
        alter table knowledge_library
            add constraint knowledge_library_category_subject_key_key
            unique (category, subject, key);
    end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 3. Indexes for targeted retrieval (plan §13: never load the whole
--    table into context - query by category/subject/topics/key)
-- ─────────────────────────────────────────────────────────────

create index if not exists idx_knowledge_category on knowledge_library(category);
create index if not exists idx_knowledge_subject on knowledge_library(subject);
create index if not exists idx_knowledge_topics on knowledge_library using gin(topics);

-- ─────────────────────────────────────────────────────────────
-- 4. Keep updated_at accurate on every UPDATE, same convention as
--    user_profile (see set_updated_at() in supabase_schema.sql).
-- ─────────────────────────────────────────────────────────────

drop trigger if exists trg_knowledge_library_updated_at on knowledge_library;
create trigger trg_knowledge_library_updated_at
    before update on knowledge_library
    for each row execute function set_updated_at();
