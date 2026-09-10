-- Additive: no existing claims are rewritten or removed.
-- Pending ingestion proposals are not trusted knowledge or verification runs.
create table if not exists public.knowledge_ingestion_reviews (
    id bigint generated always as identity primary key,
    existing_id bigint references public.knowledge_library(id) on delete set null,
    candidate jsonb not null,
    expected_snapshot jsonb,
    existing_snapshot jsonb,
    reason text not null,
    dedupe_key text not null unique,
    status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
    occurrences integer not null default 1,
    first_seen_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    constraint knowledge_ingestion_candidate_object check (jsonb_typeof(candidate) = 'object')
);
create index if not exists idx_knowledge_ingestion_review_pending
    on public.knowledge_ingestion_reviews(status, last_seen_at desc);
alter table public.knowledge_ingestion_reviews enable row level security;
revoke all on public.knowledge_ingestion_reviews from anon, authenticated;
grant select, insert, update on public.knowledge_ingestion_reviews to service_role;
grant usage, select on sequence public.knowledge_ingestion_reviews_id_seq to service_role;

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
    ) on conflict (dedupe_key) do update
        set occurrences = knowledge_ingestion_reviews.occurrences + 1, last_seen_at = now()
    returning id into review_id;
    return jsonb_build_object('action', 'review', 'review_id', review_id, 'record_id', current_row.id, 'reason', review_reason);
end;
$$;
revoke all on function public.ingest_knowledge_candidate(jsonb, jsonb, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.ingest_knowledge_candidate(jsonb, jsonb, boolean, boolean, text) to service_role;
