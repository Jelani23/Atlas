-- Targeted, manually reviewed DATA REPAIR, not a schema migration.
-- Review the three replacement claims and URLs before running in Supabase.
-- Sources checked 2026-09-14: https://github.com/Vedal987 and https://vedal.ai/
-- Drops unsupported nationality / model / voice / personality specifics.
-- Retains row IDs and identities; no bulk trust upgrade or deletion.
-- All three rows must still match the inspected snapshot. Otherwise the entire
-- transaction aborts. A second run also aborts rather than overwriting changes.
BEGIN;
DO $repair$
DECLARE
    target record;
    old_row public.knowledge_library%ROWTYPE;
    evidence jsonb;
BEGIN
    FOR target IN
        SELECT * FROM (VALUES
            (60::bigint, 'creator',
             'Vedal, a pseudonymous British programmer',
             'Neuro-sama is an AI VTuber created by Vedal.',
             'https://github.com/Vedal987'),
            (61::bigint, 'evil_neuro_characteristics',
             'Evil Neuro is presented as Neuro-sama''s twin sister with a distinct model, voice, and amoral personality',
             'The official site presents Evil Neuro as Neuro-sama''s twin sister and an AI VTuber.',
             'https://vedal.ai/'),
            (62::bigint, 'streaming_platform',
             'Neuro-sama streams primarily on Twitch under the channel vedal987',
             'Neuro-sama''s official site links to the Twitch channel vedal987 for live streams.',
             'https://vedal.ai/')
        ) AS replacements(id, key, old_value, new_value, url)
        ORDER BY id
    LOOP
        SELECT * INTO old_row FROM public.knowledge_library WHERE id = target.id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Knowledge record % is missing; repair aborted.', target.id;
        END IF;
        IF old_row.category IS DISTINCT FROM 'technology'
           OR old_row.subject IS DISTINCT FROM 'neuro_sama'
           OR old_row.key IS DISTINCT FROM target.key
           OR old_row.value IS DISTINCT FROM target.old_value
           OR old_row.source IS DISTINCT FROM 'web_search: Can you look up information on Neuro-sama?'
           OR old_row.source_type IS DISTINCT FROM 'web_search'
           OR old_row.verification_status IS DISTINCT FROM 'needs_source'
           OR old_row.updated_at IS DISTINCT FROM '2026-09-02T13:40:31.980626+00:00'::timestamptz
           OR old_row.superseded_by IS NOT NULL THEN
            RAISE EXCEPTION 'Knowledge record % changed since inspection; repair aborted.', target.id;
        END IF;
        evidence := jsonb_build_array(jsonb_build_object(
            'url', target.url, 'reviewed_on', '2026-09-14',
            'checked_at', current_timestamp,
            'note', 'Manual source review; applying only the narrowed claim in this script.'));
        UPDATE public.knowledge_library SET
            value = target.new_value,
            type = 'fact', confidence = 0.95,
            source = target.url, source_type = 'web_search',
            verification_status = 'verified', verification_method = 'manual',
            verification_sources = evidence,
            verification_note = 'Primary pages reviewed 2026-09-14. Unsupported legacy details removed; this does not verify private implementation details or live status.',
            verification_error = NULL,
            verification_attempts = coalesce(verification_attempts, 0) + 1,
            last_checked_at = current_timestamp, last_verified_at = current_timestamp,
            expires_at = NULL, updated_at = current_timestamp
        WHERE id = target.id;
        INSERT INTO public.knowledge_verification_runs
            (knowledge_id, status, query, previous_value, proposed_value, confidence,
             reason, evidence, completed_at)
        VALUES (target.id, 'updated', 'Manual primary-source repair reviewed 2026-09-14',
            old_row.value, target.new_value, 0.95,
            'Replace query-only provenance and narrow the claim to directly supported information.',
            evidence, current_timestamp);
    END LOOP;
END
$repair$;
COMMIT;

SELECT id, subject, key, value, verification_status, source
FROM public.knowledge_library WHERE id IN (60, 61, 62) ORDER BY id;
-- Restart the Atlas backend before testing, to clear its in-process cache.
