-- Numeric session IDs match public.sessions.id. A distinct RPC name avoids
-- ambiguous PostgREST overloads with the legacy UUID function.
alter table public.sessions add column if not exists working_context jsonb not null default '{}'::jsonb;

create or replace function public.merge_session_working_context_v2(p_session_id bigint, p_delta jsonb)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare merged jsonb;
begin
    if p_session_id is null or p_session_id <= 0 or p_delta is null or jsonb_typeof(p_delta) <> 'object' then
        raise exception 'Working context requires a positive numeric session id and an object delta.';
    end if;
    -- UPDATE locks the row and merges against the current database value.
    -- Separate top-level keys survive concurrent delta updates; the same key
    -- uses the latest update. Arrays are values, not implicit append requests.
    update public.sessions
        set working_context = coalesce(working_context, '{}'::jsonb) || p_delta
        where id = p_session_id
        returning working_context into merged;
    if not found then raise exception 'Session not found for working-context merge.'; end if;
    return merged;
end;
$$;
revoke all on function public.merge_session_working_context_v2(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.merge_session_working_context_v2(bigint, jsonb) to service_role;
grant select (id, working_context), update (working_context) on public.sessions to service_role;
