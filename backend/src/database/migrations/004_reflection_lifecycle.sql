-- Durable lifecycle for UI-era session reflections.
--
-- Reflection generation is an asynchronous local-model job. It must survive
-- Electron closing, backend restarts, and model/parser failures instead of
-- depending on an LLM call finishing during the app's shutdown timeout.
--
-- Existing unreflected sessions are deliberately marked `backfill_pending`,
-- not `pending`. The normal live worker ignores that historical backlog so it
-- cannot monopolize the local GPU. A later explicit backfill command can move
-- a reviewed batch to `pending`.

alter table sessions
    add column if not exists reflection_status text not null default 'open';

alter table sessions
    add column if not exists reflection_attempts integer not null default 0;

alter table sessions
    add column if not exists reflection_error text;

alter table sessions
    add column if not exists reflection_started_at timestamptz;

alter table sessions
    add column if not exists reflected_at timestamptz;

-- Establish the lifecycle state for rows that predate this migration.
update sessions s
set reflection_status = 'complete',
    reflected_at = coalesce(s.reflected_at, r."timestamp")
from reflections r
where r.session_id = s.id;

update sessions s
set reflection_status = case
        when (
            select count(*)
            from conversations c
            where c.session_id = s.id
        ) >= 3 then 'backfill_pending'
        else 'skipped'
    end
where not exists (
    select 1
    from reflections r
    where r.session_id = s.id
);

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'sessions_reflection_status_check'
          and conrelid = 'public.sessions'::regclass
    ) then
        alter table sessions
            add constraint sessions_reflection_status_check
            check (reflection_status in (
                'open',
                'pending',
                'processing',
                'complete',
                'failed',
                'skipped',
                'backfill_pending'
            ));
    end if;
end $$;

create index if not exists idx_sessions_reflection_queue
    on sessions(reflection_status, ended_at, id);
