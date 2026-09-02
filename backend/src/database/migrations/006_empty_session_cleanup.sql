create or replace function remove_empty_sessions(
    p_exclude_session_id bigint default null
)
returns table(id bigint)
language sql
security invoker
set search_path = public
as $$
    delete from sessions s
    where (p_exclude_session_id is null or s.id <> p_exclude_session_id)
      and not exists (
          select 1
          from conversations c
          where c.session_id = s.id
      )
    returning s.id;
$$;
