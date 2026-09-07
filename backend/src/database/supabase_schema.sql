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

-- Recoverable canonical cleanup. Redundant rows are superseded rather
-- than deleted, and both before/after states are retained for rollback.
create table if not exists knowledge_canonicalization_events (
    id bigint generated always as identity primary key,
    source_id bigint references knowledge_library(id) on delete set null,
    target_id bigint references knowledge_library(id) on delete set null,
    relation text not null default 'equivalent',
    reason text not null,
    source_snapshot jsonb not null,
    target_snapshot jsonb not null,
    result_snapshot jsonb not null,
    created_at timestamptz not null default now(),
    reverted_at timestamptz,
    revert_reason text,
    constraint knowledge_canonicalization_relation_check
        check (relation in ('equivalent'))
);

create index if not exists idx_knowledge_canonicalization_records
    on knowledge_canonicalization_events(source_id, target_id, created_at desc);

create or replace function merge_equivalent_knowledge_records(
    p_source_id bigint,
    p_target_id bigint,
    p_reason text
) returns bigint
language plpgsql
as $$
declare
    source_row knowledge_library%rowtype;
    target_row knowledge_library%rowtype;
    merged_source knowledge_library%rowtype;
    merged_target knowledge_library%rowtype;
    merged_topics text[];
    event_id bigint;
begin
    if p_source_id is null or p_target_id is null or p_source_id = p_target_id then
        raise exception 'Source and target must be different knowledge records.';
    end if;
    if nullif(btrim(p_reason), '') is null then
        raise exception 'A merge reason is required.';
    end if;

    perform id from knowledge_library
    where id in (p_source_id, p_target_id)
    order by id for update;

    select * into source_row from knowledge_library where id = p_source_id;
    select * into target_row from knowledge_library where id = p_target_id;
    if source_row.id is null or target_row.id is null then
        raise exception 'Both knowledge records must exist.';
    end if;
    if source_row.verification_status in ('superseded', 'contradicted') then
        raise exception 'Source record % is not active.', p_source_id;
    end if;
    if target_row.verification_status in ('superseded', 'contradicted') then
        raise exception 'Target record % is not active.', p_target_id;
    end if;

    -- Preserve the survivor's metadata; source topics may describe other claims.
    merged_topics := coalesce(target_row.topics, '{}'::text[]);

    update knowledge_library
    set topics = merged_topics,
        confidence = greatest(source_row.confidence, target_row.confidence)
    where id = p_target_id returning * into merged_target;

    update knowledge_library
    set verification_status = 'superseded',
        superseded_by = p_target_id,
        verification_note = concat_ws(
            E'\n',
            nullif(verification_note, ''),
            'Superseded during canonical cleanup: ' || p_reason
        )
    where id = p_source_id returning * into merged_source;

    insert into knowledge_canonicalization_events (
        source_id, target_id, relation, reason,
        source_snapshot, target_snapshot, result_snapshot
    ) values (
        p_source_id, p_target_id, 'equivalent', p_reason,
        to_jsonb(source_row), to_jsonb(target_row),
        jsonb_build_object('source', to_jsonb(merged_source), 'target', to_jsonb(merged_target))
    ) returning id into event_id;

    return event_id;
end;
$$;

create or replace function revert_knowledge_merge(
    p_event_id bigint,
    p_reason text
) returns boolean
language plpgsql
as $$
declare
    event_row knowledge_canonicalization_events%rowtype;
    current_source knowledge_library%rowtype;
    current_target knowledge_library%rowtype;
    source_before jsonb;
    target_before jsonb;
begin
    if nullif(btrim(p_reason), '') is null then
        raise exception 'A rollback reason is required.';
    end if;

    select * into event_row from knowledge_canonicalization_events
    where id = p_event_id for update;
    if event_row.id is null then raise exception 'Merge event % does not exist.', p_event_id; end if;
    if event_row.reverted_at is not null then raise exception 'Merge event % was already reverted.', p_event_id; end if;

    perform id from knowledge_library
    where id in (event_row.source_id, event_row.target_id)
    order by id for update;
    select * into current_source from knowledge_library where id = event_row.source_id;
    select * into current_target from knowledge_library where id = event_row.target_id;
    if current_source.id is null or current_target.id is null then
        raise exception 'The merged records must still exist to roll back safely.';
    end if;
    if to_jsonb(current_source) <> event_row.result_snapshot->'source' or
       to_jsonb(current_target) <> event_row.result_snapshot->'target' then
        raise exception 'The records changed after the merge; automatic rollback is unsafe.';
    end if;

    source_before := event_row.source_snapshot;
    target_before := event_row.target_snapshot;

    update knowledge_library set
        category = source_before->>'category', subject = source_before->>'subject',
        topics = array(select jsonb_array_elements_text(source_before->'topics')),
        type = source_before->>'type', key = source_before->>'key', value = source_before->>'value',
        confidence = (source_before->>'confidence')::double precision,
        source = source_before->>'source', source_type = source_before->>'source_type',
        verification_status = source_before->>'verification_status',
        verification_method = source_before->>'verification_method',
        verification_sources = coalesce(source_before->'verification_sources', '[]'::jsonb),
        verification_note = source_before->>'verification_note',
        verification_error = source_before->>'verification_error',
        verification_attempts = (source_before->>'verification_attempts')::integer,
        last_checked_at = nullif(source_before->>'last_checked_at', '')::timestamptz,
        last_verified_at = nullif(source_before->>'last_verified_at', '')::timestamptz,
        expires_at = nullif(source_before->>'expires_at', '')::timestamptz,
        superseded_by = nullif(source_before->>'superseded_by', '')::bigint
    where id = event_row.source_id;

    update knowledge_library set
        category = target_before->>'category', subject = target_before->>'subject',
        topics = array(select jsonb_array_elements_text(target_before->'topics')),
        type = target_before->>'type', key = target_before->>'key', value = target_before->>'value',
        confidence = (target_before->>'confidence')::double precision,
        source = target_before->>'source', source_type = target_before->>'source_type',
        verification_status = target_before->>'verification_status',
        verification_method = target_before->>'verification_method',
        verification_sources = coalesce(target_before->'verification_sources', '[]'::jsonb),
        verification_note = target_before->>'verification_note',
        verification_error = target_before->>'verification_error',
        verification_attempts = (target_before->>'verification_attempts')::integer,
        last_checked_at = nullif(target_before->>'last_checked_at', '')::timestamptz,
        last_verified_at = nullif(target_before->>'last_verified_at', '')::timestamptz,
        expires_at = nullif(target_before->>'expires_at', '')::timestamptz,
        superseded_by = nullif(target_before->>'superseded_by', '')::bigint
    where id = event_row.target_id;

    update knowledge_canonicalization_events
    set reverted_at = now(), revert_reason = p_reason
    where id = p_event_id;
    return true;
end;
$$;

-- Composite cleanup maps one source to several existing atomic records.
create table if not exists knowledge_decomposition_events (
    id bigint generated always as identity primary key,
    source_id bigint references knowledge_library(id) on delete set null,
    destination_ids bigint[] not null,
    reason text not null,
    source_snapshot jsonb not null,
    destination_snapshots jsonb not null,
    component_plan jsonb not null,
    result_source_snapshot jsonb not null,
    created_at timestamptz not null default now(),
    reverted_at timestamptz,
    revert_reason text
);

create index if not exists idx_knowledge_decomposition_source
    on knowledge_decomposition_events(source_id, created_at desc);

create or replace function apply_knowledge_decomposition(
    p_source_id bigint,
    p_destination_ids bigint[],
    p_component_plan jsonb,
    p_expected_source_updated_at timestamptz,
    p_reason text
) returns bigint
language plpgsql
as $$
declare
    source_row knowledge_library%rowtype;
    result_source knowledge_library%rowtype;
    clean_destination_ids bigint[];
    plan_destination_ids bigint[];
    destination_count integer;
    destination_snapshots jsonb;
    event_id bigint;
begin
    if p_source_id is null then raise exception 'A source record is required.'; end if;
    if nullif(btrim(p_reason), '') is null then raise exception 'A decomposition reason is required.'; end if;
    if jsonb_typeof(p_component_plan) <> 'array' or jsonb_array_length(p_component_plan) < 2 then
        raise exception 'The component plan must be a JSON array.';
    end if;

    select array_agg(distinct destination_id order by destination_id)
    into clean_destination_ids
    from unnest(coalesce(p_destination_ids, '{}'::bigint[])) as destination_id;
    if coalesce(cardinality(clean_destination_ids), 0) < 2 then raise exception 'A decomposition requires at least two distinct destinations.'; end if;
    if p_source_id = any(clean_destination_ids) then raise exception 'The source cannot also be a decomposition destination.'; end if;

    if exists (
        select 1 from jsonb_array_elements(p_component_plan) as component
        where component->>'relation' <> 'equivalent'
           or nullif(btrim(component->>'source_span'), '') is null
           or nullif(component->>'destination_id', '') is null
    ) then raise exception 'Every component must be an equivalent, grounded destination mapping.'; end if;
    select array_agg(distinct (component->>'destination_id')::bigint order by (component->>'destination_id')::bigint)
    into plan_destination_ids from jsonb_array_elements(p_component_plan) as component;
    if plan_destination_ids <> clean_destination_ids then raise exception 'The component plan and destination ids do not match.'; end if;

    perform id from knowledge_library
    where id = p_source_id or id = any(clean_destination_ids)
    order by id for update;
    select * into source_row from knowledge_library where id = p_source_id;
    if source_row.id is null then raise exception 'Source record % does not exist.', p_source_id; end if;
    if p_expected_source_updated_at is null or source_row.updated_at <> p_expected_source_updated_at then
        raise exception 'The source changed after review; generate and approve a new plan.';
    end if;
    if source_row.verification_status in ('superseded', 'contradicted') or source_row.superseded_by is not null then
        raise exception 'Source record % is not active.', p_source_id;
    end if;

    select count(*), jsonb_agg(to_jsonb(k) order by k.id)
    into destination_count, destination_snapshots
    from knowledge_library k
    where k.id = any(clean_destination_ids)
      and k.verification_status not in ('superseded', 'contradicted')
      and k.superseded_by is null;
    if destination_count <> cardinality(clean_destination_ids) then
        raise exception 'Every decomposition destination must exist and be active.';
    end if;

    update knowledge_library
    set verification_status = 'superseded',
        superseded_by = null,
        verification_note = concat_ws(E'\n', nullif(verification_note, ''),
            'Superseded by atomic decomposition: ' || p_reason)
    where id = p_source_id returning * into result_source;

    insert into knowledge_decomposition_events (
        source_id, destination_ids, reason, source_snapshot,
        destination_snapshots, component_plan, result_source_snapshot
    ) values (
        p_source_id, clean_destination_ids, p_reason, to_jsonb(source_row),
        destination_snapshots, p_component_plan, to_jsonb(result_source)
    ) returning id into event_id;
    return event_id;
end;
$$;

create or replace function revert_knowledge_decomposition(
    p_event_id bigint,
    p_reason text
) returns boolean
language plpgsql
as $$
declare
    event_row knowledge_decomposition_events%rowtype;
    current_source knowledge_library%rowtype;
    source_before jsonb;
begin
    if nullif(btrim(p_reason), '') is null then raise exception 'A rollback reason is required.'; end if;
    select * into event_row from knowledge_decomposition_events where id = p_event_id for update;
    if event_row.id is null then raise exception 'Decomposition event % does not exist.', p_event_id; end if;
    if event_row.reverted_at is not null then raise exception 'Decomposition event % was already reverted.', p_event_id; end if;

    select * into current_source from knowledge_library where id = event_row.source_id for update;
    if current_source.id is null then raise exception 'The source record must still exist to roll back safely.'; end if;
    if to_jsonb(current_source) <> event_row.result_source_snapshot then
        raise exception 'The source changed after decomposition; automatic rollback is unsafe.';
    end if;

    source_before := event_row.source_snapshot;
    update knowledge_library set
        category = source_before->>'category', subject = source_before->>'subject',
        topics = array(select jsonb_array_elements_text(source_before->'topics')),
        type = source_before->>'type', key = source_before->>'key', value = source_before->>'value',
        confidence = (source_before->>'confidence')::double precision,
        source = source_before->>'source', source_type = source_before->>'source_type',
        verification_status = source_before->>'verification_status',
        verification_method = source_before->>'verification_method',
        verification_sources = coalesce(source_before->'verification_sources', '[]'::jsonb),
        verification_note = source_before->>'verification_note',
        verification_error = source_before->>'verification_error',
        verification_attempts = (source_before->>'verification_attempts')::integer,
        last_checked_at = nullif(source_before->>'last_checked_at', '')::timestamptz,
        last_verified_at = nullif(source_before->>'last_verified_at', '')::timestamptz,
        expires_at = nullif(source_before->>'expires_at', '')::timestamptz,
        superseded_by = nullif(source_before->>'superseded_by', '')::bigint
    where id = event_row.source_id;

    update knowledge_decomposition_events set reverted_at = now(), revert_reason = p_reason
    where id = p_event_id;
    return true;
end;
$$;

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
