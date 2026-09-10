-- Requires 011. No existing canonical claims are modified by this migration.
alter table public.knowledge_ingestion_reviews
    add column if not exists resolution_action text,
    add column if not exists resolution_reason text,
    add column if not exists resolved_at timestamptz,
    add column if not exists resolution_before jsonb,
    add column if not exists resolution_after jsonb;

-- A repeated proposal after a decision is a new review, not a rewrite of its audit history.
alter table public.knowledge_ingestion_reviews
    drop constraint if exists knowledge_ingestion_reviews_dedupe_key_key;
create unique index if not exists knowledge_ingestion_pending_dedupe
    on public.knowledge_ingestion_reviews(dedupe_key) where status = 'pending';

create or replace function public.ingest_knowledge_candidate(
    p_candidate jsonb,
    p_expected jsonb default null,
    p_equivalent boolean default false,
    p_force_review boolean default false,
    p_reason text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    current_row public.knowledge_library%rowtype;
    review_reason text;
    review_id bigint;
    candidate_topics text[];
    fingerprint text;
begin
    if p_candidate is null or jsonb_typeof(p_candidate) <> 'object' then
        raise exception 'Knowledge candidate must be an object.';
    end if;
    if exists (
        select 1 from unnest(array['category', 'subject', 'key', 'value']) field
        where jsonb_typeof(p_candidate -> field) is distinct from 'string'
           or nullif(btrim(p_candidate ->> field), '') is null
    ) then
        raise exception 'Knowledge candidate requires nonempty category, subject, key, and value strings.';
    end if;
    if p_expected is not null and (jsonb_typeof(p_expected) <> 'object' or p_expected ->> 'id' is null) then
        raise exception 'Expected knowledge snapshot requires a record id.';
    end if;
    select coalesce(array_agg(topic order by topic), '{}'::text[]) into candidate_topics
    from (select distinct jsonb_array_elements_text(coalesce(p_candidate -> 'topics', '[]'::jsonb)) as topic) tags;

    -- INSERT ON CONFLICT never overwrites a row inserted by another request.
    if p_expected is null and not coalesce(p_force_review, false) then
        insert into public.knowledge_library (
            category, subject, key, value, topics, type, confidence, source, source_type, verification_status
        ) values (
            p_candidate ->> 'category', p_candidate ->> 'subject', p_candidate ->> 'key', p_candidate ->> 'value',
            candidate_topics, coalesce(p_candidate ->> 'type', 'fact'),
            coalesce((p_candidate ->> 'confidence')::double precision, 1),
            nullif(p_candidate ->> 'source', ''), coalesce(p_candidate ->> 'source_type', 'conversation'),
            case when nullif(p_candidate ->> 'source', '') is null then 'needs_source'
                 when p_candidate ->> 'source_type' = 'web_search' and (p_candidate ->> 'source') !~* 'https?://' then 'needs_source'
                 else 'unverified' end
        ) on conflict (category, subject, key) do nothing
        returning * into current_row;
        if found then
            return jsonb_build_object('action', 'inserted', 'record_id', current_row.id);
        end if;
    end if;

    -- Serialize refreshes with verification/cleanup and compare the expected snapshot.
    select * into current_row from public.knowledge_library
    where category = p_candidate ->> 'category' and subject = p_candidate ->> 'subject' and key = p_candidate ->> 'key'
    for update;

    if coalesce(p_force_review, false) then
        review_reason := coalesce(nullif(btrim(p_reason), ''), 'Semantic comparison requested review.');
    elsif current_row.id is null then
        review_reason := 'The expected canonical record no longer exists.';
    elsif p_expected is not null and (
        current_row.id is distinct from (p_expected ->> 'id')::bigint or
        current_row.value is distinct from (p_expected ->> 'value') or
        current_row.updated_at is distinct from (p_expected ->> 'updated_at')::timestamptz or
        current_row.verification_status is distinct from (p_expected ->> 'verification_status') or
        current_row.verification_attempts is distinct from (p_expected ->> 'verification_attempts')::integer
    ) then
        review_reason := 'The canonical record changed after comparison; review the current snapshot.';
    elsif current_row.verification_status in ('superseded', 'contradicted', 'pending') then
        review_reason := 'The canonical record is inactive or currently being verified.';
    elsif btrim(current_row.value) = btrim(p_candidate ->> 'value') or
          (coalesce(p_equivalent, false) and p_expected is not null) then
        -- Preserve the canonical value, type, verification evidence and expiry.
        -- Do not replace established provenance with a later unverified source.
        update public.knowledge_library
        set topics = candidate_topics,
            confidence = greatest(confidence, coalesce((p_candidate ->> 'confidence')::double precision, confidence)),
            source = coalesce(nullif(source, ''), nullif(p_candidate ->> 'source', '')),
            source_type = case when nullif(source, '') is null then coalesce(p_candidate ->> 'source_type', source_type) else source_type end,
            updated_at = now()
        where id = current_row.id;
        return jsonb_build_object('action', 'refreshed', 'record_id', current_row.id);
    else
        review_reason := 'A different value for this canonical identity requires review, not an automatic overwrite.';
    end if;

    -- Identical repeated proposals share one review item; retain a repeat count.
    fingerprint := md5(jsonb_build_object(
        'candidate', p_candidate, 'existing_id', current_row.id, 'existing_value', current_row.value,
        'existing_updated_at', current_row.updated_at, 'reason', review_reason
    )::text);
    insert into public.knowledge_ingestion_reviews (
        existing_id, candidate, expected_snapshot, existing_snapshot, reason, dedupe_key
    ) values (
        current_row.id, p_candidate, p_expected,
        case when current_row.id is null then null else to_jsonb(current_row) end,
        review_reason, fingerprint
    ) on conflict (dedupe_key) where status = 'pending' do update
        set occurrences = knowledge_ingestion_reviews.occurrences + 1, last_seen_at = now()
    returning id into review_id;
    return jsonb_build_object('action', 'review', 'review_id', review_id, 'record_id', current_row.id, 'reason', review_reason);
end;
$$;
revoke all on function public.ingest_knowledge_candidate(jsonb, jsonb, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.ingest_knowledge_candidate(jsonb, jsonb, boolean, boolean, text) to service_role;

-- Privileged administrative operation. No automatic or conversational approval path.
create or replace function public.resolve_knowledge_ingestion_review(
    p_review_id bigint, p_action text, p_reason text,
    p_expected_review jsonb, p_expected_current jsonb
) returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
    review_row public.knowledge_ingestion_reviews%rowtype;
    current_row public.knowledge_library%rowtype;
    before_row jsonb;
    after_row jsonb;
    target_id bigint;
begin
    if p_action is null or p_action not in ('dismiss', 'accept_provisional') or nullif(btrim(p_reason), '') is null then
        raise exception 'Resolution requires dismiss or accept_provisional and a nonempty reason.';
    end if;
    if p_expected_review is null or jsonb_typeof(p_expected_review) <> 'object' then
        raise exception 'Resolution requires the previewed review snapshot.';
    end if;
    -- Match ingestion lock order: knowledge row first, then review row.
    select existing_id into target_id from public.knowledge_ingestion_reviews where id = p_review_id;
    if not found then raise exception 'Review not found.'; end if;
    if target_id is not null then
        select * into current_row from public.knowledge_library where id = target_id for update;
    end if;
    select * into review_row from public.knowledge_ingestion_reviews where id = p_review_id for update;
    if not found then raise exception 'Review not found.'; end if;
    if review_row.status <> 'pending' then raise exception 'Review is already resolved or dismissed.'; end if;
    if review_row is distinct from jsonb_populate_record(null::public.knowledge_ingestion_reviews, p_expected_review)
       or review_row.existing_id is distinct from target_id then
        raise exception 'Review changed after preview. Create a new preview.';
    end if;
    before_row := case when current_row.id is null then null else to_jsonb(current_row) end;
    if (before_row is null and p_expected_current is not null)
       or (before_row is not null and (p_expected_current is null or
           current_row is distinct from jsonb_populate_record(null::public.knowledge_library, p_expected_current))) then
        raise exception 'Canonical record changed after preview. Create a new preview.';
    end if;
    after_row := before_row;
    if p_action = 'accept_provisional' then
        if current_row.id is null then raise exception 'Acceptance requires an existing canonical record.'; end if;
        if current_row.verification_status not in ('needs_source', 'unverified', 'failed')
           or current_row.superseded_by is not null then
            raise exception 'Cannot replace a verified, inactive, or pending record through provisional acceptance.';
        end if;
        if current_row.category is distinct from (review_row.candidate ->> 'category')
           or current_row.subject is distinct from (review_row.candidate ->> 'subject')
           or current_row.key is distinct from (review_row.candidate ->> 'key')
           or jsonb_typeof(review_row.candidate -> 'value') is distinct from 'string'
           or nullif(btrim(review_row.candidate ->> 'value'), '') is null then
            raise exception 'Candidate identity or value is not suitable for replacement.';
        end if;
        update public.knowledge_library
        set value = review_row.candidate ->> 'value',
            type = case when review_row.candidate ->> 'type' = 'fact' then 'fact' else 'assumption' end,
            -- Do not carry confidence, topic tags, or evidence from the displaced claim.
            topics = '{}'::text[], confidence = 0,
            source = nullif(review_row.candidate ->> 'source', ''),
            source_type = coalesce(review_row.candidate ->> 'source_type', 'conversation'),
            verification_status = case when nullif(review_row.candidate ->> 'source', '') is null then 'needs_source'
                when review_row.candidate ->> 'source_type' = 'web_search'
                     and (review_row.candidate ->> 'source') !~* '^https?://' then 'needs_source'
                else 'unverified' end,
            verification_method = null, verification_sources = '[]'::jsonb,
            verification_note = null, verification_error = null,
            last_checked_at = null, last_verified_at = null, expires_at = null,
            updated_at = clock_timestamp()
        where id = current_row.id returning to_jsonb(knowledge_library.*) into after_row;
    end if;
    update public.knowledge_ingestion_reviews
    set status = case when p_action = 'dismiss' then 'dismissed' else 'resolved' end,
        resolution_action = p_action, resolution_reason = btrim(p_reason), resolved_at = clock_timestamp(),
        resolution_before = before_row, resolution_after = after_row
    where id = p_review_id;
    return jsonb_build_object('action', p_action, 'review_id', p_review_id, 'record_id', target_id);
end;
$$;
revoke all on function public.resolve_knowledge_ingestion_review(bigint, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.resolve_knowledge_ingestion_review(bigint, text, text, jsonb, jsonb) to service_role;

