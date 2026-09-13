-- Optional manual cleanup of the three known fictional test records.
-- This is NOT a migration. Review the expected values below before running.
-- Real SQLite/PostgreSQL facts (including knowledge IDs 90/91) are untouched.
-- Any missing target or mismatched identity/value/status aborts the transaction.
begin;
do $$
declare affected integer;
begin
    -- Do not cascade-delete verification history or break existing lifecycle links.
    if exists (select 1 from public.knowledge_verification_runs where knowledge_id in (88, 89))
       or exists (select 1 from public.knowledge_ingestion_reviews where existing_id in (88, 89))
       or exists (select 1 from public.knowledge_maintenance_events where knowledge_id in (88, 89))
       or exists (select 1 from public.knowledge_canonicalization_events where source_id in (88, 89) or target_id in (88, 89))
       or exists (select 1 from public.knowledge_decomposition_events where source_id in (88, 89) or destination_ids && array[88, 89]::bigint[])
       or exists (select 1 from public.knowledge_library where superseded_by in (88, 89)) then
        raise exception 'Fictional rows have linked lifecycle records; inspect before cleanup.';
    end if;
    delete from public.project_memory
    where id = 96 and project_key = 'atlas' and subject = 'general'
      and key = 'cedar_demo_service_database'
      and value = 'The cedar_demo_service stores its data in a SQLite database.';
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Cedar row 96 missing or changed; no cleanup committed.'; end if;

    delete from public.knowledge_library
    where id = 88 and category = 'technology' and subject = 'sqlite' and key = 'database_engine'
      and value = 'The birch_demo_service uses SQLite as its database engine.'
      and verification_status = 'needs_source' and verification_attempts = 0 and superseded_by is null;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Birch row 88 missing or changed; no cleanup committed.'; end if;

    delete from public.knowledge_library
    where id = 89 and category = 'technology' and subject = 'postgresql' and key = 'database_engine'
      and value = 'The birch_demo_service now uses PostgreSQL as its database engine, replacing SQLite.'
      and verification_status = 'needs_source' and verification_attempts = 0 and superseded_by is null;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Birch row 89 missing or changed; no cleanup committed.'; end if;
end;
$$;
commit;
-- Restart Atlas afterward and use a new chat; existing chat/reflection text is
-- not erased by removing canonical records. This script does not delete history.
