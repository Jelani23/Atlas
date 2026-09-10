-- Run after 012. All synthetic table changes roll back; sequence numbers may advance.
begin;
do $$
declare
    subject_name text := '__atlas_resolution_test_' || md5(random()::text || clock_timestamp()::text);
    candidate jsonb;
    result jsonb;
    expected jsonb;
    preview jsonb;
    after_row jsonb;
    record_id bigint;
    review_id bigint;
    failed boolean;
begin
    candidate := jsonb_build_object('category', 'technology', 'subject', subject_name, 'key', 'capacity', 'value', '10 MB');
    result := public.ingest_knowledge_candidate(candidate);
    record_id := (result ->> 'record_id')::bigint;
    select to_jsonb(k) into expected from public.knowledge_library k where id = record_id;
    candidate := candidate || '{"value":"20 MB","source":"https://example.test/evidence","type":"fact","verification_status":"verified"}'::jsonb;
    result := public.ingest_knowledge_candidate(candidate, expected);
    review_id := (result ->> 'review_id')::bigint;
    select to_jsonb(r) into preview from public.knowledge_ingestion_reviews r where id = review_id;

    -- A repeated arrival changes the review snapshot, invalidating the older preview.
    perform public.ingest_knowledge_candidate(candidate, expected);
    failed := false;
    begin
        perform public.resolve_knowledge_ingestion_review(review_id, 'dismiss', 'Old preview', preview, expected);
    exception when others then failed := true; end;
    assert failed, 'Stale review preview must fail';
    select to_jsonb(r) into preview from public.knowledge_ingestion_reviews r where id = review_id;
    result := public.resolve_knowledge_ingestion_review(review_id, 'dismiss', 'Reviewed and dismissed', preview, expected);
    assert result ->> 'action' = 'dismiss';
    assert (select value from public.knowledge_library where id = record_id) = '10 MB';
    assert (select resolution_before = resolution_after from public.knowledge_ingestion_reviews where id = review_id);

    -- Recurrence creates a new pending review while preserving the decision history.
    result := public.ingest_knowledge_candidate(candidate, expected);
    assert (result ->> 'review_id')::bigint <> review_id, 'Do not reuse a dismissed review';
    assert (select status from public.knowledge_ingestion_reviews where id = review_id) = 'dismissed';
    review_id := (result ->> 'review_id')::bigint;
    select to_jsonb(r) into preview from public.knowledge_ingestion_reviews r where id = review_id;

    update public.knowledge_library set value = '15 MB' where id = record_id;
    failed := false;
    begin
        perform public.resolve_knowledge_ingestion_review(review_id, 'accept_provisional', 'Old record', preview, expected);
    exception when others then failed := true; end;
    assert failed, 'Stale canonical preview must fail';
    assert (select status from public.knowledge_ingestion_reviews where id = review_id) = 'pending';

    update public.knowledge_library set verification_status = 'verified' where id = record_id;
    select to_jsonb(k) into expected from public.knowledge_library k where id = record_id;
    failed := false;
    begin
        perform public.resolve_knowledge_ingestion_review(review_id, 'accept_provisional', 'Verified target', preview, expected);
    exception when others then failed := true; end;
    assert failed, 'Cannot replace a verified target';
    update public.knowledge_library set verification_status = 'pending' where id = record_id;
    select to_jsonb(k) into expected from public.knowledge_library k where id = record_id;
    failed := false;
    begin
        perform public.resolve_knowledge_ingestion_review(review_id, 'accept_provisional', 'Pending target', preview, expected);
    exception when others then failed := true; end;
    assert failed, 'Cannot steal a pending verification';

    update public.knowledge_library set verification_status = 'unverified', verification_method = 'old',
        verification_sources = '[{"url":"https://example.test/old"}]'::jsonb,
        last_verified_at = now(), expires_at = now() + interval '1 day', topics = array['old_topic'], confidence = 0.9
    where id = record_id;
    select to_jsonb(k) into expected from public.knowledge_library k where id = record_id;
    result := public.resolve_knowledge_ingestion_review(review_id, 'accept_provisional', 'Reviewed new claim', preview, expected);
    select to_jsonb(k) into after_row from public.knowledge_library k where id = record_id;
    assert after_row ->> 'value' = '20 MB';
    assert after_row ->> 'verification_status' = 'unverified', 'Acceptance is not verification';
    assert after_row -> 'verification_sources' = '[]'::jsonb;
    assert after_row ->> 'last_verified_at' is null and after_row ->> 'expires_at' is null;
    assert after_row -> 'topics' = '[]'::jsonb and (after_row ->> 'confidence')::numeric = 0;
    assert (select resolution_before = expected and resolution_after = after_row from public.knowledge_ingestion_reviews where id = review_id);
    failed := false;
    begin
        perform public.resolve_knowledge_ingestion_review(review_id, 'accept_provisional', 'Replay', preview, expected);
    exception when others then failed := true; end;
    assert failed, 'Cannot apply a resolved review twice';
    raise notice 'Review resolution assertions passed; fixture changes will roll back.';
end;
$$;
rollback;
