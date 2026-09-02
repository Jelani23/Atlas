-- Atlas — Supabase schema
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query)
-- before running scripts/migrateToSupabase.js.
--
-- This consolidates everything that used to live split across atlas.db
-- (better-sqlite3) and the JSON files in src/memory/*.json into one Postgres
-- database. Table names/columns intentionally mirror the old JSON shapes so
-- the migration script is a near-direct copy, not a re-modeling exercise.

-- ─────────────────────────────────────────────────────────────
-- Sessions & working memory (previously: atlas.db `sessions`, `conversations`)
-- ─────────────────────────────────────────────────────────────

create table if not exists sessions (
    id bigint generated always as identity primary key,
    started_at timestamptz not null default now(),
    ended_at timestamptz,
    title text,
    reflection_status text not null default 'open',
    reflection_attempts integer not null default 0,
    reflection_error text,
    reflection_started_at timestamptz,
    reflected_at timestamptz,
    constraint sessions_reflection_status_check check (reflection_status in (
        'open', 'pending', 'processing', 'complete', 'failed', 'skipped', 'backfill_pending'
    ))
);

-- Safe to re-run: adds the column if this schema already ran before
-- `title` existed.
alter table sessions add column if not exists title text;

create index if not exists idx_sessions_reflection_queue
    on sessions(reflection_status, ended_at, id);

create table if not exists conversations (
    id bigint generated always as identity primary key,
    session_id bigint references sessions(id) on delete cascade,
    role text not null,
    content text not null,
    "timestamp" timestamptz not null default now(),
    topics text[] not null default '{}',
    project_key text,
    importance smallint not null default 0
);

create index if not exists idx_conversation_session on conversations(session_id);
create index if not exists idx_conversations_topics on conversations using gin(topics);
create index if not exists idx_conversations_project_key on conversations(project_key);
create index if not exists idx_conversations_project_importance
    on conversations(project_key, importance desc, "timestamp" desc);

create or replace function remove_empty_sessions(
    p_exclude_session_id bigint default null
)
returns table(id bigint)
language sql
security invoker
set search_path = public
as $$
    delete from sessions s
    where (p_exclude_session_id is null or s.id <> p_exclude_session_id)
      and not exists (
          select 1
          from conversations c
          where c.session_id = s.id
      )
    returning s.id;
$$;

-- ─────────────────────────────────────────────────────────────
-- Long-term profile (previously: atlas.db `user_profile`)
-- Holds "user", "behavior", and "relationship" category memories.
-- ─────────────────────────────────────────────────────────────

create table if not exists user_profile (
    id bigint generated always as identity primary key,
    category text not null,
    key text not null,
    value text not null,
    confidence real default 1.0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (category, key)
);

create index if not exists idx_profile_category on user_profile(category);
create index if not exists idx_profile_key on user_profile(key);

create or replace function set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_user_profile_updated_at on user_profile;
create trigger trg_user_profile_updated_at
    before update on user_profile
    for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Project memory (previously: src/memory/projectMemory.json)
-- ─────────────────────────────────────────────────────────────

create table if not exists project_memory (
    id bigint generated always as identity primary key,
    subject text not null default 'general',
    key text not null,
    value text not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_project_memory_subject on project_memory(subject);

-- ─────────────────────────────────────────────────────────────
-- Knowledge library (previously: src/memory/knowledgeLibrary.json)
--
-- Structured internal knowledge base: durable facts, definitions,
-- concepts, relationships, observations, claims, assumptions, and
-- hypotheses Alice has acquired from conversation, search,
-- documents, tools, model knowledge, or her own reasoning.
--
-- Canonical identity is (category, subject, key) - topics are
-- retrieval metadata only, not identity. See
-- migrations/001_knowledge_library_upgrade.sql for the upgrade path
-- from the original (subject, key) shape on an existing database;
-- this CREATE is for a fresh install only.
-- ─────────────────────────────────────────────────────────────

create table if not exists knowledge_library (
    id bigint generated always as identity primary key,
    category text not null default 'general',
    subject text not null default 'general',
    topics text[] not null default '{}',
    type text not null default 'fact',
    key text not null,
    value text not null,
    confidence double precision not null default 1.0,
    source text,
    source_type text not null default 'conversation',
    verification_status text not null default 'unverified',
    verification_method text,
    verification_sources jsonb not null default '[]'::jsonb,
    verification_note text,
    verification_error text,
    verification_attempts integer not null default 0,
    last_checked_at timestamptz,
    last_verified_at timestamptz,
    expires_at timestamptz,
    superseded_by bigint references knowledge_library(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint knowledge_library_verification_status_check check (verification_status in (
        'needs_source', 'unverified', 'pending', 'verified',
        'contradicted', 'superseded', 'failed'
    )),
    unique (category, subject, key)
);

create index if not exists idx_knowledge_category on knowledge_library(category);
create index if not exists idx_knowledge_subject on knowledge_library(subject);
create index if not exists idx_knowledge_topics on knowledge_library using gin(topics);
create index if not exists idx_knowledge_verification_status
    on knowledge_library(verification_status, expires_at, updated_at desc);

drop trigger if exists trg_knowledge_library_updated_at on knowledge_library;
create trigger trg_knowledge_library_updated_at
    before update on knowledge_library
    for each row execute function set_updated_at();

create table if not exists knowledge_verification_runs (
    id bigint generated always as identity primary key,
    knowledge_id bigint not null references knowledge_library(id) on delete cascade,
    status text not null default 'pending',
    query text not null,
    previous_value text,
    proposed_value text,
    confidence double precision,
    reason text,
    evidence jsonb not null default '[]'::jsonb,
    error text,
    started_at timestamptz not null default now(),
    completed_at timestamptz,
    constraint knowledge_verification_runs_status_check check (status in (
        'pending', 'confirmed', 'updated', 'contradicted', 'insufficient', 'failed'
    ))
);

create index if not exists idx_knowledge_verification_runs_record
    on knowledge_verification_runs(knowledge_id, started_at desc);

-- ─────────────────────────────────────────────────────────────
-- Procedural memory (previously: src/memory/proceduralMemory.json)
-- ─────────────────────────────────────────────────────────────

create table if not exists procedural_memory (
    id bigint generated always as identity primary key,
    trigger text not null,
    action text not null,
    context text not null default 'general',
    updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Dev state (previously: src/memory/devState.json)
-- ─────────────────────────────────────────────────────────────

create table if not exists dev_state (
    id bigint generated always as identity primary key,
    feature text not null,
    status text not null,
    updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Reflection journal (previously: src/memory/reflections.json)
--
-- One row per conversation session: a compact summary written for
-- Alice's own contextual understanding, not a standalone fact (no
-- key/value — see migrations/002_reflections_upgrade.sql for the
-- upgrade path from the original bare shape, and for why this is
-- deliberately thinner than knowledge_library).
-- ─────────────────────────────────────────────────────────────

create table if not exists reflections (
    id bigint generated always as identity primary key,
    session_id bigint references sessions(id) on delete set null,
    category text not null default 'general',
    subject text not null default 'general',
    topics text[] not null default '{}',
    summary text not null,
    anchors text[] not null default '{}',
    decisions text[] not null default '{}',
    comparisons text[] not null default '{}',
    open_loops text[] not null default '{}',
    schema_version integer not null default 1,
    source_message_count integer,
    confidence double precision not null default 1.0,
    "timestamp" timestamptz not null default now()
);

create index if not exists idx_reflections_category on reflections(category);
create index if not exists idx_reflections_subject on reflections(subject);
create index if not exists idx_reflections_topics on reflections using gin(topics);
create index if not exists idx_reflections_anchors on reflections using gin(anchors);
create unique index if not exists idx_reflections_session_unique
    on reflections(session_id)
    where session_id is not null;

-- ─────────────────────────────────────────────────────────────
-- World model (previously: src/memory/worldModel.json)
-- Single-row config table — Atlas reads it, you edit it by hand.
-- ─────────────────────────────────────────────────────────────

create table if not exists world_model (
    id int primary key default 1,
    data jsonb not null,
    updated_at timestamptz not null default now(),
    constraint world_model_singleton check (id = 1)
);
