alter table knowledge_library
    add column if not exists verification_status text not null default 'unverified',
    add column if not exists verification_method text,
    add column if not exists verification_sources jsonb not null default '[]'::jsonb,
    add column if not exists verification_note text,
    add column if not exists verification_error text,
    add column if not exists verification_attempts integer not null default 0,
    add column if not exists last_checked_at timestamptz,
    add column if not exists last_verified_at timestamptz,
    add column if not exists expires_at timestamptz,
    add column if not exists superseded_by bigint references knowledge_library(id) on delete set null;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'knowledge_library_verification_status_check'
          and conrelid = 'knowledge_library'::regclass
    ) then
        alter table knowledge_library
            add constraint knowledge_library_verification_status_check
            check (verification_status in (
                'needs_source', 'unverified', 'pending', 'verified',
                'contradicted', 'superseded', 'failed'
            ));
    end if;
end $$;

update knowledge_library
set verification_status = case
    when source is null or btrim(source) = '' then 'needs_source'
    when source_type = 'web_search' and source !~* 'https?://' then 'needs_source'
    else 'unverified'
end
where verification_status = 'unverified'
  and last_verified_at is null;

create index if not exists idx_knowledge_verification_status
    on knowledge_library(verification_status, expires_at, updated_at desc);

create table if not exists knowledge_verification_runs (
    id bigint generated always as identity primary key,
    knowledge_id bigint not null references knowledge_library(id) on delete cascade,
    status text not null default 'pending',
    query text not null,
    previous_value text,
    proposed_value text,
    confidence double precision,
    reason text,
    evidence jsonb not null default '[]'::jsonb,
    error text,
    started_at timestamptz not null default now(),
    completed_at timestamptz,
    constraint knowledge_verification_runs_status_check check (status in (
        'pending', 'confirmed', 'updated', 'contradicted', 'insufficient', 'failed'
    ))
);

create index if not exists idx_knowledge_verification_runs_record
    on knowledge_verification_runs(knowledge_id, started_at desc);
