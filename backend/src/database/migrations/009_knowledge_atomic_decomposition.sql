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

    if coalesce(cardinality(clean_destination_ids), 0) < 2 then
        raise exception 'A decomposition requires at least two distinct destinations.';
    end if;
    if p_source_id = any(clean_destination_ids) then
        raise exception 'The source cannot also be a decomposition destination.';
    end if;

    if exists (
        select 1 from jsonb_array_elements(p_component_plan) as component
        where component->>'relation' <> 'equivalent'
           or nullif(btrim(component->>'source_span'), '') is null
           or nullif(component->>'destination_id', '') is null
    ) then
        raise exception 'Every component must be an equivalent, grounded destination mapping.';
    end if;
    select array_agg(distinct (component->>'destination_id')::bigint order by (component->>'destination_id')::bigint)
    into plan_destination_ids
    from jsonb_array_elements(p_component_plan) as component;
    if plan_destination_ids <> clean_destination_ids then
        raise exception 'The component plan and destination ids do not match.';
    end if;

    perform id
    from knowledge_library
    where id = p_source_id or id = any(clean_destination_ids)
    order by id
    for update;

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
        verification_note = concat_ws(
            E'\n',
            nullif(verification_note, ''),
            'Superseded by atomic decomposition: ' || p_reason
        )
    where id = p_source_id
    returning * into result_source;

    insert into knowledge_decomposition_events (
        source_id,
        destination_ids,
        reason,
        source_snapshot,
        destination_snapshots,
        component_plan,
        result_source_snapshot
    ) values (
        p_source_id,
        clean_destination_ids,
        p_reason,
        to_jsonb(source_row),
        destination_snapshots,
        p_component_plan,
        to_jsonb(result_source)
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

    select * into event_row
    from knowledge_decomposition_events
    where id = p_event_id
    for update;

    if event_row.id is null then raise exception 'Decomposition event % does not exist.', p_event_id; end if;
    if event_row.reverted_at is not null then raise exception 'Decomposition event % was already reverted.', p_event_id; end if;

    select * into current_source
    from knowledge_library
    where id = event_row.source_id
    for update;

    if current_source.id is null then raise exception 'The source record must still exist to roll back safely.'; end if;
    if to_jsonb(current_source) <> event_row.result_source_snapshot then
        raise exception 'The source changed after decomposition; automatic rollback is unsafe.';
    end if;

    source_before := event_row.source_snapshot;
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

    update knowledge_decomposition_events
    set reverted_at = now(), revert_reason = p_reason
    where id = p_event_id;

    return true;
end;
$$;
