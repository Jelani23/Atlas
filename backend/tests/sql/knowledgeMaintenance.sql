-- Run after 013. Synthetic rows only; all table changes roll back.
begin;
do $$
declare
    subject_name text := '__atlas_maintenance_test_' || md5(random()::text || clock_timestamp()::text);
    candidate jsonb;
    result jsonb;
    original jsonb;
    claimed jsonb;
    preview jsonb;
    current_snapshot jsonb;
    accepted jsonb;
    record_id bigint;
    review_id bigint;
    pending_id bigint;
    event_count bigint;
    failed boolean;
begin
    -- Recover one stale owner, preserve its claim, and reject its late writes/replay.
    insert into public.knowledge_library(category, subject, key, value, verification_status, verification_attempts,
        updated_at, verification_sources, last_verified_at, expires_at)
    values ('technology', subject_name, 'stale_attempt', 'Original pending claim', 'pending', 4,
        now() - interval '1 hour', '[{"url":"https://example.test/old"}]', now(), now() + interval '1 day')
    returning id, to_jsonb(knowledge_library.*) into pending_id, claimed;
    result := public.maintain_knowledge_record('recover_verification', pending_id, null, 'Interrupted fixture', claimed);
    select to_jsonb(k) into current_snapshot from public.knowledge_library k where id = pending_id;
    assert current_snapshot ->> 'value' = claimed ->> 'value';
    assert current_snapshot ->> 'verification_status' = 'failed';
    assert (current_snapshot ->> 'verification_attempts')::integer = 5;
    assert current_snapshot -> 'verification_sources' = '[]'::jsonb;
    assert current_snapshot ->> 'last_verified_at' is null and current_snapshot ->> 'expires_at' is null;
    assert (select before_snapshot = claimed and after_snapshot = current_snapshot from public.knowledge_maintenance_events where id = (result ->> 'event_id')::bigint);
    update public.knowledge_library set value = 'Stale worker result', verification_status = 'verified'
        where id = pending_id and value = claimed ->> 'value' and updated_at = (claimed ->> 'updated_at')::timestamptz
          and verification_status = 'pending' and verification_attempts = (claimed ->> 'verification_attempts')::integer;
    assert not found, 'Recovered owner must not publish a late result';
    failed := false;
    begin perform public.maintain_knowledge_record('recover_verification', pending_id, null, 'Replay', claimed);
    exception when others then failed := true; end;
    assert failed, 'Recovery replay must fail';

    -- Retry becomes a new attempt; a fresh owner cannot be recovered.
    update public.knowledge_library set verification_status = 'pending', verification_attempts = verification_attempts + 1 where id = pending_id;
    select to_jsonb(k) into current_snapshot from public.knowledge_library k where id = pending_id;
    failed := false;
    begin perform public.maintain_knowledge_record('recover_verification', pending_id, null, 'Fresh owner', current_snapshot);
    exception when others then failed := true; end;
    assert failed, 'Do not recover fresh attempts';

    -- A changed snapshot must not be recovered even when still old and pending.
    insert into public.knowledge_library(category, subject, key, value, verification_status, verification_attempts, updated_at)
    values ('technology', subject_name, 'other_attempt', 'Other pending claim', 'pending', 1, now() - interval '1 hour')
    returning id, to_jsonb(knowledge_library.*) into pending_id, claimed;
    failed := false;
    begin perform public.maintain_knowledge_record('recover_verification', pending_id, null, 'Bad snapshot', claimed || '{"value":"Different"}');
    exception when others then failed := true; end;
    assert failed, 'All expected fields must still match';

    -- Ingestion -> changed-value review -> explicit provisional acceptance -> undo.
    candidate := jsonb_build_object('category', 'technology', 'subject', subject_name, 'key', 'capacity', 'value', '10 MB', 'source', 'https://example.test/original');
    result := public.ingest_knowledge_candidate(candidate);
    record_id := (result ->> 'record_id')::bigint;
    -- Old evidence must not be resurrected by undo.
    update public.knowledge_library set verification_sources = '[{"url":"https://example.test/old"}]',
        last_verified_at = now(), expires_at = now() + interval '1 day', confidence = 0.9, topics = array['old_topic'] where id = record_id;
    select to_jsonb(k) into original from public.knowledge_library k where id = record_id;
    result := public.ingest_knowledge_candidate(candidate || '{"value":"20 MB"}', original);
    review_id := (result ->> 'review_id')::bigint;
    select to_jsonb(r) into preview from public.knowledge_ingestion_reviews r where id = review_id;
    perform public.resolve_knowledge_ingestion_review(review_id, 'accept_provisional', 'Reviewed fixture', preview, original);
    select to_jsonb(r) into preview from public.knowledge_ingestion_reviews r where id = review_id;
    select to_jsonb(k) into accepted from public.knowledge_library k where id = record_id;

    -- A tampered review or missing snapshot cannot pass.
    failed := false;
    begin perform public.maintain_knowledge_record('undo_review', record_id, review_id, 'Tamper', accepted, preview || '{"resolution_reason":"tampered"}');
    exception when others then failed := true; end;
    assert failed, 'Full review snapshot must match';
    failed := false;
    begin perform public.maintain_knowledge_record('undo_review', record_id, review_id, 'Missing', null, preview);
    exception when others then failed := true; end;
    assert failed, 'Missing current snapshot must fail';

    -- New work invalidates undo, even with a freshly captured preview.
    begin
        update public.knowledge_library set topics = array['new_work'] where id = record_id;
        select to_jsonb(k) into current_snapshot from public.knowledge_library k where id = record_id;
        failed := false;
        begin perform public.maintain_knowledge_record('undo_review', record_id, review_id, 'Would overwrite', current_snapshot, preview);
        exception when others then failed := true; end;
        assert failed, 'Fresh preview cannot bypass changes since acceptance';
        raise exception using errcode = 'ZX001', message = 'Rollback simulated new work';
    exception when sqlstate 'ZX001' then null; end;
    begin
        update public.knowledge_library set verification_status = 'verified' where id = record_id;
        select to_jsonb(k) into current_snapshot from public.knowledge_library k where id = record_id;
        failed := false;
        begin perform public.maintain_knowledge_record('undo_review', record_id, review_id, 'Verified', current_snapshot, preview);
        exception when others then failed := true; end;
        assert failed, 'Cannot undo a newly verified claim';
        raise exception using errcode = 'ZX001', message = 'Rollback simulated verification';
    exception when sqlstate 'ZX001' then null; end;

    result := public.maintain_knowledge_record('undo_review', record_id, review_id, 'Restore original fixture', accepted, preview);
    select to_jsonb(k) into current_snapshot from public.knowledge_library k where id = record_id;
    assert current_snapshot ->> 'value' = '10 MB';
    assert current_snapshot ->> 'source' = 'https://example.test/original';
    assert current_snapshot ->> 'verification_status' = 'unverified';
    assert current_snapshot -> 'verification_sources' = '[]'::jsonb and current_snapshot -> 'topics' = '[]'::jsonb;
    assert current_snapshot ->> 'last_verified_at' is null and current_snapshot ->> 'expires_at' is null;
    assert (current_snapshot ->> 'confidence')::numeric = 0;
    assert (current_snapshot ->> 'verification_attempts')::integer > (accepted ->> 'verification_attempts')::integer;
    assert (select to_jsonb(r) = preview from public.knowledge_ingestion_reviews r where id = review_id), 'Original resolution audit must remain unchanged';
    assert (select before_snapshot = accepted and after_snapshot = current_snapshot from public.knowledge_maintenance_events where id = (result ->> 'event_id')::bigint);
    select count(*) into event_count from public.knowledge_maintenance_events;
    failed := false;
    begin perform public.maintain_knowledge_record('undo_review', record_id, review_id, 'Replay', current_snapshot, preview);
    exception when others then failed := true; end;
    assert failed, 'Undo is single-use';
    assert (select count(*) from public.knowledge_maintenance_events) = event_count, 'Rejected operation must not append an audit';
    assert not has_function_privilege('anon', 'public.maintain_knowledge_record(text,bigint,bigint,text,jsonb,jsonb)', 'EXECUTE');
    assert not has_function_privilege('authenticated', 'public.maintain_knowledge_record(text,bigint,bigint,text,jsonb,jsonb)', 'EXECUTE');
    assert has_function_privilege('service_role', 'public.maintain_knowledge_record(text,bigint,bigint,text,jsonb,jsonb)', 'EXECUTE');
    raise notice 'Maintenance assertions passed; all fixture changes will roll back.';
end;
$$;
rollback;
