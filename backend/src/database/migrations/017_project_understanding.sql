-- Requires migration 016. No pilot JSON or existing memories are imported.
begin;
create table if not exists public.project_understanding (
    project_key text not null check (project_key = 'atlas'),
    agent_id text not null references public.agents(agent_id) on delete restrict,
    file_path text not null check (file_path ~ '^src/.+\.(js|json)$' and file_path !~ '(^|/)\.\.(/|$)'),
    record jsonb not null,
    updated_at timestamptz not null default now(),
    primary key (project_key, agent_id, file_path),
    check ((jsonb_typeof(record) = 'object'
        and record->>'schema' = '2'
        and record->>'project' = project_key
        and record->>'agentId' = agent_id
        and record->>'path' = file_path
        and record->>'status' = 'interpretation_unverified'
        and record->>'version' ~ '^[a-f0-9]{64}$'
        and record->>'analysisRevision' ~ '^[a-f0-9]{64}$'
        and jsonb_typeof(record->'analysis') = 'object') is true)
);
create or replace function public.touch_project_understanding()
returns trigger language plpgsql security invoker set search_path=public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists project_understanding_updated on public.project_understanding;
create trigger project_understanding_updated before update on public.project_understanding
    for each row execute function public.touch_project_understanding();
alter table public.project_understanding enable row level security;
revoke all on public.project_understanding from public, anon, authenticated;
grant select, insert, update on public.project_understanding to service_role;
revoke all on function public.touch_project_understanding() from public, anon, authenticated;
grant execute on function public.touch_project_understanding() to service_role;
commit;
