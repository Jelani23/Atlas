-- Requires 012. Adds explicit, snapshot-checked recovery and review undo.
-- No canonical claims are changed by applying this migration.
create table if not exists public.knowledge_maintenance_events (
    id bigint generated always as identity primary key,
    knowledge_id bigint references public.knowledge_library(id) on delete set null,
    review_id bigint references public.knowledge_ingestion_reviews(id) on delete set null,
    action text not null check (action in ('recover_verification', 'undo_review')),
    reason text not null,
    before_snapshot jsonb not null,
    after_snapshot jsonb not null,
    created_at timestamptz not null default clock_timestamp()
);
create unique index if not exists knowledge_maintenance_undo_once
    on public.knowledge_maintenance_events(review_id) where action = 'undo_review';
alter table public.knowledge_maintenance_events enable row level security;
revoke all on public.knowledge_maintenance_events from public, anon, authenticated;
grant select, insert on public.knowledge_maintenance_events to service_role;
grant usage, select on sequence public.knowledge_maintenance_events_id_seq to service_role;

create or replace function public.maintain_knowledge_record(
    p_action text, p_record_id bigint, p_review_id bigint, p_reason text,
    p_expected_current jsonb, p_expected_review jsonb default null
) returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
    current_row public.knowledge_library%rowtype;
    review_row public.knowledge_ingestion_reviews%rowtype;
    restored public.knowledge_library%rowtype;
    before_row jsonb;
    after_row jsonb;
    event_id bigint;
begin
    if p_action is null or p_action not in ('recover_verification', 'undo_review')
       or nullif(btrim(p_reason), '') is null or p_record_id is null then
        raise exception 'Maintenance requires an action, record id, and reason.';
    end if;
    if p_expected_current is null or jsonb_typeof(p_expected_current) <> 'object' then
        raise exception 'Maintenance requires the previewed canonical snapshot.';
    end if;
    -- Same lock order as ingestion and review resolution: knowledge, then review.
    select * into current_row from public.knowledge_library where id = p_record_id for update;
    if not found then raise exception 'Canonical record not found.'; end if;
    if current_row is distinct from jsonb_populate_record(null::public.knowledge_library, p_expected_current) then
        raise exception 'Canonical record changed after preview. Create a new preview.';
    end if;
    before_row := to_jsonb(current_row);

    if p_action = 'recover_verification' then
        if p_review_id is not null or p_expected_review is not null then
            raise exception 'Verification recovery does not accept a review.';
        end if;
        if current_row.verification_status <> 'pending' or current_row.superseded_by is not null
           or current_row.verification_attempts < 1
           or current_row.updated_at > clock_timestamp() - interval '30 minutes' then
            raise exception 'Recovery requires an active pending attempt unchanged for at least 30 minutes.';
        end if;
        -- Incrementing the attempt also invalidates an old worker if timestamps coincide.
        -- This is an explicit cancellation, not proof that the worker crashed.
        update public.knowledge_library set
            verification_status = 'failed', verification_attempts = verification_attempts + 1,
            confidence = 0, verification_method = null, verification_sources = '[]'::jsonb,
            verification_note = null, verification_error = 'Operator recovered pending attempt: ' || btrim(p_reason),
            last_checked_at = null, last_verified_at = null, expires_at = null,
            updated_at = clock_timestamp()
        where id = p_record_id returning to_jsonb(knowledge_library.*) into after_row;
    else
        if p_review_id is null or p_expected_review is null or jsonb_typeof(p_expected_review) <> 'object' then
            raise exception 'Undo requires the previewed resolved review.';
        end if;
        select * into review_row from public.knowledge_ingestion_reviews where id = p_review_id for update;
        if not found then raise exception 'Review not found.'; end if;
        if review_row is distinct from jsonb_populate_record(null::public.knowledge_ingestion_reviews, p_expected_review) then
            raise exception 'Review changed after preview. Create a new preview.';
        end if;
        if review_row.status <> 'resolved' or review_row.resolution_action is distinct from 'accept_provisional'
           or review_row.existing_id is distinct from p_record_id
           or review_row.resolution_before is null or review_row.resolution_after is null then
            raise exception 'Only a reviewed provisional replacement can be undone.';
        end if;
        if exists (select 1 from public.knowledge_maintenance_events where review_id = p_review_id and action = 'undo_review') then
            raise exception 'This review has already been undone.';
        end if;
        if current_row.verification_status not in ('needs_source', 'unverified', 'failed')
           or current_row.superseded_by is not null
           or current_row is distinct from jsonb_populate_record(null::public.knowledge_library, review_row.resolution_after) then
            raise exception 'The replacement has changed since acceptance; undo would overwrite newer work.';
        end if;
        restored := jsonb_populate_record(null::public.knowledge_library, review_row.resolution_before);
        if restored.id is distinct from p_record_id or restored.category is distinct from current_row.category
           or restored.subject is distinct from current_row.subject or restored.key is distinct from current_row.key
           or nullif(btrim(restored.value), '') is null then
            raise exception 'The saved original identity or value is invalid.';
        end if;
        -- Restore the claim and provenance, never old verification, counters, or timestamps.
        update public.knowledge_library set
            value = restored.value, type = restored.type, source = restored.source, source_type = restored.source_type,
            topics = '{}'::text[], confidence = 0,
            verification_status = case when nullif(restored.source, '') is null then 'needs_source'
                when restored.source_type = 'web_search' and restored.source !~* '^https?://' then 'needs_source'
                else 'unverified' end,
            verification_attempts = verification_attempts + 1,
            verification_method = null, verification_sources = '[]'::jsonb,
            verification_note = null, verification_error = null,
            last_checked_at = null, last_verified_at = null, expires_at = null,
            updated_at = clock_timestamp()
        where id = p_record_id returning to_jsonb(knowledge_library.*) into after_row;
    end if;
    insert into public.knowledge_maintenance_events(knowledge_id, review_id, action, reason, before_snapshot, after_snapshot)
    values (p_record_id, p_review_id, p_action, btrim(p_reason), before_row, after_row) returning id into event_id;
    return jsonb_build_object('action', p_action, 'record_id', p_record_id, 'review_id', p_review_id, 'event_id', event_id);
end;
$$;
revoke all on function public.maintain_knowledge_record(text, bigint, bigint, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.maintain_knowledge_record(text, bigint, bigint, text, jsonb, jsonb) to service_role;
