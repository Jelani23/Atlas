-- Run after 014. Only synthetic session rows; table changes roll back.
begin;
do $$
declare session_id bigint; result jsonb; failed boolean;
begin
    insert into public.sessions(title) values ('__atlas_working_context_test__') returning id into session_id;
    set local role service_role;
    result := public.merge_session_working_context_v2(session_id, '{"current_topic":"database"}');
    assert result ->> 'current_topic' = 'database';
    result := public.merge_session_working_context_v2(session_id, '{"current_project":"atlas","recent_decisions":["fixture"]}');
    assert result ->> 'current_topic' = 'database', 'Another delta must retain existing keys';
    result := public.merge_session_working_context_v2(session_id, '{"current_topic":"memory"}');
    assert result ->> 'current_project' = 'atlas';
    assert result -> 'recent_decisions' = '["fixture"]'::jsonb;
    assert result ->> 'current_topic' = 'memory';
    assert public.merge_session_working_context_v2(session_id, '{}') = result;
    failed := false;
    begin perform public.merge_session_working_context_v2(session_id, '[]');
    exception when others then failed := true; end;
    assert failed, 'Array deltas must fail';
    failed := false;
    begin perform public.merge_session_working_context_v2(null, '{}');
    exception when others then failed := true; end;
    assert failed, 'Missing session IDs must fail';
    assert (select working_context from public.sessions where id = session_id) = result;
    reset role;
    delete from public.sessions where id = session_id;
    failed := false;
    begin perform public.merge_session_working_context_v2(session_id, '{}');
    exception when others then failed := true; end;
    assert failed, 'Missing rows must not look like a successful empty merge';
    assert not has_function_privilege('anon', 'public.merge_session_working_context_v2(bigint,jsonb)', 'EXECUTE');
    assert not has_function_privilege('authenticated', 'public.merge_session_working_context_v2(bigint,jsonb)', 'EXECUTE');
    raise notice 'Working-context assertions passed; synthetic table changes roll back.';
end;
$$;
rollback;
