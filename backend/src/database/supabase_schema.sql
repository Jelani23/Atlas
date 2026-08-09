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
    title text
);

-- Safe to re-run: adds the column if this schema already ran before
-- `title` existed.
alter table sessions add column if not exists title text;

create table if not exists conversations (
    id bigint generated always as identity primary key,
    session_id bigint references sessions(id) on delete cascade,
    role text not null,
    content text not null,
    "timestamp" timestamptz not null default now()
);

create index if not exists idx_conversation_session on conversations(session_id);

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
-- ─────────────────────────────────────────────────────────────

create table if not exists knowledge_library (
    id bigint generated always as identity primary key,
    subject text not null default 'general',
    key text not null,
    value text not null,
    updated_at timestamptz not null default now(),
    unique (subject, key)
);

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
-- ─────────────────────────────────────────────────────────────

create table if not exists reflections (
    id bigint generated always as identity primary key,
    session_id bigint references sessions(id) on delete set null,
    summary text not null,
    "timestamp" timestamptz not null default now()
);

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
