-- Scheduling/audit state only. Claims still belong to knowledge_library and
-- its existing ingestion/review/verification workflows.
create extension if not exists pgcrypto;

create table if not exists public.knowledge_learning_jobs (
    source_key text primary key,
    source_url text not null,
    next_run_at timestamptz not null default now(),
    lease_id uuid,
    leased_until timestamptz,
    last_fingerprint text,
    last_result jsonb not null default '{}'::jsonb
);
create table if not exists public.knowledge_learning_runs (
    id uuid primary key,
    source_key text not null references public.knowledge_learning_jobs(source_key),
    started_at timestamptz not null default now(),
    completed_at timestamptz,
    status text not null default 'running' check (status in ('running','complete','failed','interrupted')),
    result jsonb not null default '{}'::jsonb
);
alter table public.knowledge_learning_jobs enable row level security;
alter table public.knowledge_learning_runs enable row level security;
revoke all on public.knowledge_learning_jobs, public.knowledge_learning_runs from public, anon, authenticated;
grant all on public.knowledge_learning_jobs, public.knowledge_learning_runs to service_role;

create or replace function public.claim_knowledge_learning(p_source_key text, p_source_url text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare job public.knowledge_learning_jobs%rowtype; token uuid := gen_random_uuid();
begin
    if p_source_key !~ '^[a-z0-9_]{1,64}$' or p_source_url !~ '^https://' then
        raise exception 'Invalid learning source';
    end if;
    -- One passive learner across backend processes, not one per source.
    perform pg_advisory_xact_lock(715015);
    if exists(select 1 from public.knowledge_learning_jobs where leased_until > now()) then return null; end if;
    update public.knowledge_learning_runs r set status='interrupted', completed_at=now(),
        result=jsonb_build_object('error','Lease expired after an interrupted backend run')
    where r.status='running' and exists(select 1 from public.knowledge_learning_jobs j
        where j.lease_id=r.id and j.leased_until <= now());
    insert into public.knowledge_learning_jobs(source_key,source_url) values(p_source_key,p_source_url)
        on conflict(source_key) do nothing;
    select * into job from public.knowledge_learning_jobs where source_key=p_source_key for update;
    if job.next_run_at > now() and job.source_url=p_source_url then return null; end if;
    update public.knowledge_learning_jobs set lease_id=token, leased_until=now()+interval '10 minutes',
        source_url=p_source_url where source_key=p_source_key;
    insert into public.knowledge_learning_runs(id,source_key) values(token,p_source_key);
    return jsonb_build_object('id',token,'source_key',p_source_key,
        'last_fingerprint',case when job.source_url=p_source_url then job.last_fingerprint else null end,
        'last_result',case when job.source_url=p_source_url then job.last_result else '{}'::jsonb end);
end $$;

create or replace function public.finish_knowledge_learning(
    p_run_id uuid, p_status text, p_result jsonb, p_fingerprint text, p_interval_seconds integer
) returns boolean language plpgsql security invoker set search_path = public as $$
declare job public.knowledge_learning_jobs%rowtype;
begin
    if p_status not in ('complete','failed','interrupted') or p_interval_seconds < 3600
       or p_interval_seconds > 604800 or octet_length(p_result::text)>100000 then
        raise exception 'Invalid learning result';
    end if;
    select * into job from public.knowledge_learning_jobs where lease_id=p_run_id for update;
    if not found or job.leased_until <= now() then raise exception 'Learning lease no longer owned'; end if;
    update public.knowledge_learning_runs set status=p_status,result=p_result,completed_at=now()
        where id=p_run_id and status='running';
    if not found then raise exception 'Learning run already finished'; end if;
    update public.knowledge_learning_jobs set lease_id=null,leased_until=null,
        next_run_at=now()+make_interval(secs=>case when p_status='complete' then p_interval_seconds
            when p_status='interrupted' then 300 else 3600 end),
        last_fingerprint=case when p_status='complete' then p_fingerprint else last_fingerprint end,
        last_result=case when p_status='complete' then p_result else last_result end
        where source_key=job.source_key;
    return true;
end $$;
revoke all on function public.claim_knowledge_learning(text,text) from public, anon, authenticated;
revoke all on function public.finish_knowledge_learning(uuid,text,jsonb,text,integer) from public, anon, authenticated;
grant execute on function public.claim_knowledge_learning(text,text) to service_role;
grant execute on function public.finish_knowledge_learning(uuid,text,jsonb,text,integer) to service_role;
