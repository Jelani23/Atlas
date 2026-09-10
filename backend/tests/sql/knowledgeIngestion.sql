-- Run after migration 011 in the Supabase SQL editor.
-- Uses a unique synthetic identity and rolls back every table change.
-- Sequence numbers may advance; no real record is selected or modified.
begin;
do $$
declare
    test_subject text := '__atlas_ingestion_test_' || md5(random()::text || clock_timestamp()::text);
    candidate jsonb;
    result jsonb;
    expected jsonb;
    after_row jsonb;
    record_id bigint;
    review_id bigint;
begin
    candidate := jsonb_build_object('category', 'technology', 'subject', test_subject, 'key', 'capacity',
        'value', '10 MB', 'topics', jsonb_build_array('capacity'), 'source', 'https://example.test/original',
        'source_type', 'web_search', 'verification_status', 'verified');
    result := public.ingest_knowledge_candidate(candidate);
    assert result ->> 'action' = 'inserted', 'New identity must insert';
    record_id := (result ->> 'record_id')::bigint;
    select to_jsonb(k) into expected from public.knowledge_library k where id = record_id;
    assert expected ->> 'verification_status' = 'unverified', 'Ingestion cannot grant verification';

    update public.knowledge_library set verification_status = 'verified',
        verification_method = 'test_fixture', verification_sources = '[{"url":"https://example.test/verified"}]'::jsonb,
        last_verified_at = now(), expires_at = now() + interval '1 day'
    where id = record_id;
    select to_jsonb(k) into expected from public.knowledge_library k where id = record_id;
    result := public.ingest_knowledge_candidate(candidate || '{"source":"https://example.test/new"}'::jsonb, expected);
    assert result ->> 'action' = 'refreshed', 'Exact duplicate should refresh';
    select to_jsonb(k) into after_row from public.knowledge_library k where id = record_id;
    assert after_row -> 'verification_sources' = expected -> 'verification_sources', 'Preserve verification evidence';
    assert after_row -> 'expires_at' = expected -> 'expires_at', 'Do not renew freshness';
    assert after_row -> 'source' = expected -> 'source', 'Preserve established provenance';
    expected := after_row;

    result := public.ingest_knowledge_candidate(candidate || '{"value":"10 Mb"}'::jsonb, expected);
    assert result ->> 'action' = 'review', 'Case-sensitive units must not overwrite';
    review_id := (result ->> 'review_id')::bigint;
    result := public.ingest_knowledge_candidate(candidate || '{"value":"10 Mb"}'::jsonb, expected);
    assert (result ->> 'review_id')::bigint = review_id, 'Repeated proposals must reuse review item';
    assert (select occurrences from public.knowledge_ingestion_reviews where id = review_id) = 2, 'Track repeats';
    assert (select value from public.knowledge_library where id = record_id) = '10 MB', 'Canonical value unchanged';

    result := public.ingest_knowledge_candidate(candidate || '{"value":"Capacity of ten megabytes"}'::jsonb, expected, true);
    assert result ->> 'action' = 'refreshed', 'Approved equivalent with current snapshot may refresh';
    assert (select value from public.knowledge_library where id = record_id) = '10 MB', 'Retain canonical wording';

    -- Simulate a value change between the application read and the transaction.
    update public.knowledge_library set value = '20 MB' where id = record_id;
    result := public.ingest_knowledge_candidate(candidate, expected, true);
    assert result ->> 'action' = 'review', 'Stale equivalence cannot overwrite';
    assert (select value from public.knowledge_library where id = record_id) = '20 MB';

    -- An insert racing with an existing different claim cannot overwrite it.
    result := public.ingest_knowledge_candidate(candidate);
    assert result ->> 'action' = 'review', 'Conflicting insert must be held';
    assert (select value from public.knowledge_library where id = record_id) = '20 MB';

    update public.knowledge_library set verification_status = 'superseded' where id = record_id;
    result := public.ingest_knowledge_candidate(candidate || '{"value":"20 MB"}'::jsonb);
    assert result ->> 'action' = 'review', 'Do not revive a superseded record';
    assert (select verification_status from public.knowledge_library where id = record_id) = 'superseded';

    raise notice 'Knowledge ingestion transaction assertions passed; all fixture rows will be rolled back.';
end;
$$;
rollback;
