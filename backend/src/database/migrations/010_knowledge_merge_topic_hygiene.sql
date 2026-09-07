-- Replace the installed merge function. Existing records are not changed.
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

    -- Preserve the survivor's metadata; source topics may describe other claims.
    merged_topics := coalesce(target_row.topics, '{}'::text[]);

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
