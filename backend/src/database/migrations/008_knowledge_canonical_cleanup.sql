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

    -- Lock in stable order so concurrent cleanup requests cannot deadlock.
    perform id
    from knowledge_library
    where id in (p_source_id, p_target_id)
    order by id
    for update;

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

    select coalesce(array_agg(distinct topic order by topic), '{}'::text[])
    into merged_topics
    from unnest(coalesce(source_row.topics, '{}'::text[]) ||
                coalesce(target_row.topics, '{}'::text[])) as topic;

    update knowledge_library
    set topics = merged_topics,
        confidence = greatest(source_row.confidence, target_row.confidence)
    where id = p_target_id
    returning * into merged_target;

    update knowledge_library
    set verification_status = 'superseded',
        superseded_by = p_target_id,
        verification_note = concat_ws(
            E'\n',
            nullif(verification_note, ''),
            'Superseded during canonical cleanup: ' || p_reason
        )
    where id = p_source_id
    returning * into merged_source;

    insert into knowledge_canonicalization_events (
        source_id,
        target_id,
        relation,
        reason,
        source_snapshot,
        target_snapshot,
        result_snapshot
    ) values (
        p_source_id,
        p_target_id,
        'equivalent',
        p_reason,
        to_jsonb(source_row),
        to_jsonb(target_row),
        jsonb_build_object(
            'source', to_jsonb(merged_source),
            'target', to_jsonb(merged_target)
        )
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

    select * into event_row
    from knowledge_canonicalization_events
    where id = p_event_id
    for update;

    if event_row.id is null then raise exception 'Merge event % does not exist.', p_event_id; end if;
    if event_row.reverted_at is not null then raise exception 'Merge event % was already reverted.', p_event_id; end if;

    perform id
    from knowledge_library
    where id in (event_row.source_id, event_row.target_id)
    order by id
    for update;

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
        category = source_before->>'category',
        subject = source_before->>'subject',
        topics = array(select jsonb_array_elements_text(source_before->'topics')),
        type = source_before->>'type',
        key = source_before->>'key',
        value = source_before->>'value',
        confidence = (source_before->>'confidence')::double precision,
        source = source_before->>'source',
        source_type = source_before->>'source_type',
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
        category = target_before->>'category',
        subject = target_before->>'subject',
        topics = array(select jsonb_array_elements_text(target_before->'topics')),
        type = target_before->>'type',
        key = target_before->>'key',
        value = target_before->>'value',
        confidence = (target_before->>'confidence')::double precision,
        source = target_before->>'source',
        source_type = target_before->>'source_type',
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
