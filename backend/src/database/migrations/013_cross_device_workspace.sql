-- Atlas cross-device workspace
-- Adds browser-safe read access for the single Atlas owner plus durable
-- project/task/device state that remains available when the local AI host is off.
-- Run once in the Supabase SQL editor after the existing migrations.

begin;

create or replace function public.atlas_is_owner()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'jittters03@gmail.com';
$$;

grant execute on function public.atlas_is_owner() to authenticated;

alter table public.sessions enable row level security;
alter table public.conversations enable row level security;
alter table public.project_memory enable row level security;
alter table public.knowledge_library enable row level security;

grant select on table public.sessions to authenticated;
grant select on table public.conversations to authenticated;
grant select on table public.project_memory to authenticated;
grant select on table public.knowledge_library to authenticated;
grant update (title), delete on table public.sessions to authenticated;

drop policy if exists atlas_owner_read_sessions on public.sessions;
create policy atlas_owner_read_sessions on public.sessions for select to authenticated using (public.atlas_is_owner());
drop policy if exists atlas_owner_update_sessions on public.sessions;
create policy atlas_owner_update_sessions on public.sessions for update to authenticated using (public.atlas_is_owner()) with check (public.atlas_is_owner());
drop policy if exists atlas_owner_delete_sessions on public.sessions;
create policy atlas_owner_delete_sessions on public.sessions for delete to authenticated using (public.atlas_is_owner());
drop policy if exists atlas_owner_read_conversations on public.conversations;
create policy atlas_owner_read_conversations on public.conversations for select to authenticated using (public.atlas_is_owner());
drop policy if exists atlas_owner_read_project_memory on public.project_memory;
create policy atlas_owner_read_project_memory on public.project_memory for select to authenticated using (public.atlas_is_owner());
drop policy if exists atlas_owner_read_knowledge on public.knowledge_library;
create policy atlas_owner_read_knowledge on public.knowledge_library for select to authenticated using (public.atlas_is_owner());

create table if not exists public.atlas_projects (
  id text primary key,
  name text not null,
  category text not null default 'Project',
  description text not null default '',
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  current_focus text not null default '',
  progress integer check (progress between 0 and 100),
  icon text not null default 'folder',
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.atlas_project_context (
  id bigint generated always as identity primary key,
  project_id text not null references public.atlas_projects(id) on delete cascade,
  value text not null,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  unique (project_id, value)
);

create table if not exists public.atlas_project_history (
  id bigint generated always as identity primary key,
  project_id text not null references public.atlas_projects(id) on delete cascade,
  title text not null,
  detail text,
  happened_at timestamptz not null default now(),
  source text not null default 'atlas'
);
create index if not exists idx_atlas_project_history_project on public.atlas_project_history(project_id, happened_at desc);

create table if not exists public.atlas_project_files (
  id bigint generated always as identity primary key,
  project_id text not null references public.atlas_projects(id) on delete cascade,
  path text not null,
  description text not null default '',
  kind text not null default 'document' check (kind in ('code', 'document', 'link')),
  note text,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  unique (project_id, path)
);

create table if not exists public.atlas_tasks (
  id text primary key,
  project_id text references public.atlas_projects(id) on delete set null,
  title text not null,
  status text not null default 'planned' check (status in ('in-progress', 'waiting', 'planned', 'completed', 'failed', 'interrupted')),
  progress integer check (progress between 0 and 100),
  stage text,
  detail text,
  result text,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists idx_atlas_tasks_project_status on public.atlas_tasks(project_id, status, updated_at desc);

create table if not exists public.atlas_devices (
  id text primary key,
  name text not null,
  type text not null default 'computer',
  platform text,
  role text,
  status text not null default 'online',
  current_activity text,
  capabilities jsonb not null default '[]'::jsonb,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_atlas_projects_updated_at on public.atlas_projects;
create trigger trg_atlas_projects_updated_at before update on public.atlas_projects for each row execute function public.set_updated_at();
drop trigger if exists trg_atlas_tasks_updated_at on public.atlas_tasks;
create trigger trg_atlas_tasks_updated_at before update on public.atlas_tasks for each row execute function public.set_updated_at();
drop trigger if exists trg_atlas_devices_updated_at on public.atlas_devices;
create trigger trg_atlas_devices_updated_at before update on public.atlas_devices for each row execute function public.set_updated_at();

alter table public.atlas_projects enable row level security;
alter table public.atlas_project_context enable row level security;
alter table public.atlas_project_history enable row level security;
alter table public.atlas_project_files enable row level security;
alter table public.atlas_tasks enable row level security;
alter table public.atlas_devices enable row level security;

grant select on table public.atlas_projects to authenticated;
grant select on table public.atlas_project_context to authenticated;
grant select on table public.atlas_project_history to authenticated;
grant select on table public.atlas_project_files to authenticated;
grant select on table public.atlas_tasks to authenticated;
grant select, insert, update on table public.atlas_devices to authenticated;

drop policy if exists atlas_owner_read_projects on public.atlas_projects;
create policy atlas_owner_read_projects on public.atlas_projects for select to authenticated using (public.atlas_is_owner());
drop policy if exists atlas_owner_read_project_context on public.atlas_project_context;
create policy atlas_owner_read_project_context on public.atlas_project_context for select to authenticated using (public.atlas_is_owner());
drop policy if exists atlas_owner_read_project_history on public.atlas_project_history;
create policy atlas_owner_read_project_history on public.atlas_project_history for select to authenticated using (public.atlas_is_owner());
drop policy if exists atlas_owner_read_project_files on public.atlas_project_files;
create policy atlas_owner_read_project_files on public.atlas_project_files for select to authenticated using (public.atlas_is_owner());
drop policy if exists atlas_owner_read_tasks on public.atlas_tasks;
create policy atlas_owner_read_tasks on public.atlas_tasks for select to authenticated using (public.atlas_is_owner());
drop policy if exists atlas_owner_read_devices on public.atlas_devices;
create policy atlas_owner_read_devices on public.atlas_devices for select to authenticated using (public.atlas_is_owner());
drop policy if exists atlas_owner_insert_devices on public.atlas_devices;
create policy atlas_owner_insert_devices on public.atlas_devices for insert to authenticated with check (public.atlas_is_owner());
drop policy if exists atlas_owner_update_devices on public.atlas_devices;
create policy atlas_owner_update_devices on public.atlas_devices for update to authenticated using (public.atlas_is_owner()) with check (public.atlas_is_owner());

insert into public.atlas_projects (id, name, category, description, status, current_focus, progress, icon, sort_order)
values
  ('atlas', 'ATLAS', 'Personal AI Assistant', 'Alice''s assistant system, memory architecture, tools, voice, agents, and cross-device interface.', 'active', 'Cross-device persistent UI and cloud state', 72, 'cloud', 10),
  ('bindex', 'Bindex', 'Pokémon TCG Collection', 'Collection tracking, binder layouts, owned-card pricing, and Collector+ features.', 'active', 'Collection and pricing pipeline', 54, 'book', 20),
  ('short-films', 'Short Films', 'Writing & Film', 'Story development, screenwriting, thematic exploration, and future film production work.', 'paused', 'Story refinement and reflection', 72, 'film', 30),
  ('cs445', 'CS 445', 'Artificial Intelligence', 'Fall 2026 AI course project centered on ATLAS, Alice, and progressively more autonomous capabilities.', 'active', 'Build toward the October progress milestone', 30, 'graduation', 40)
on conflict (id) do update set name=excluded.name, category=excluded.category, description=excluded.description, status=excluded.status, current_focus=excluded.current_focus, progress=excluded.progress, icon=excluded.icon, sort_order=excluded.sort_order;

insert into public.atlas_project_context (project_id, value, sort_order)
values
  ('atlas', 'Alice is the assistant identity running on the ATLAS system.', 10),
  ('atlas', 'The Windows PC is the primary compute host for local models, voice, tools, and agents.', 20),
  ('atlas', 'Mac and iOS clients share the renderer and can read durable state independently from Supabase.', 30),
  ('atlas', 'The visual language uses sky, sunlight, and a central cloud avatar rather than a conventional dashboard assistant.', 40),
  ('atlas', 'High-impact actions should require a second verification step before execution.', 50),
  ('bindex', 'Bindex tracks a Pokémon TCG collection across desktop and PWA clients.', 10),
  ('bindex', 'Owned-card pricing is refreshed from external card data on a scheduled cadence.', 20),
  ('short-films', 'Story work is treated as evolving creative project context rather than disposable chat context.', 10),
  ('cs445', 'Cross-device access, task management, memory stability, and sandboxed self-improvement are core project goals.', 10)
on conflict (project_id, value) do nothing;

insert into public.atlas_tasks (id, project_id, title, status, progress, stage, detail)
values
  ('atlas-pwa-shell', 'atlas', 'Mac / iOS PWA shell', 'in-progress', 78, 'Persistent cloud state', 'Shared renderer, direct Supabase reads, remote Atlas bridge, and installable client behavior.'),
  ('atlas-project-ui', 'atlas', 'Project workspace UI', 'in-progress', 62, 'Cloud-backed project state', 'Project overview, context, work, history, and file surfaces backed by Supabase.'),
  ('atlas-device-presence', 'atlas', 'Connected-device presence', 'in-progress', 45, 'Client heartbeat foundation', 'Persist PC, Mac, phone, and future device state independently of the AI process.'),
  ('atlas-task-runtime', 'atlas', 'Background task runtime', 'planned', 10, null, 'Support long-running deeply tested work with durable progress and checkpoints.'),
  ('atlas-conversation-history', 'atlas', 'Cross-device conversation history', 'completed', 100, 'Direct cloud reads', 'Conversation history can be read without routing through the Atlas host.'),
  ('bindex-pricing', 'bindex', 'Owned-card price refresh', 'in-progress', 54, null, 'Refresh only owned cards on the pricing cadence.'),
  ('cs445-progress', 'cs445', 'Progress milestone', 'in-progress', 30, null, 'Prepare demonstrable progress for the October checkpoint.'),
  ('cs445-demo', 'cs445', 'Cross-device demo', 'in-progress', 45, null, 'Demonstrate one Atlas host across multiple client devices.'),
  ('short-films-unsent', 'short-films', 'Unsent Letters revision', 'waiting', 72, null, 'Continue refining the screenplay after the current interaction rewrite.')
on conflict (id) do update set project_id=excluded.project_id, title=excluded.title, status=excluded.status, progress=excluded.progress, stage=excluded.stage, detail=excluded.detail;

insert into public.atlas_project_history (project_id, title, detail, happened_at, source)
select seed.project_id, seed.title, seed.detail, seed.happened_at, 'migration'
from (values
  ('atlas', 'Persistent client architecture started', 'Separated durable Supabase state from the Windows-hosted Alice/agent runtime.', now() - interval '5 minutes'),
  ('atlas', 'Projects moved to cloud state', 'The Projects UI now reads shared project/task/history/file data instead of hardcoded renderer objects.', now() - interval '4 minutes'),
  ('atlas', 'Cross-device conversations enabled', 'Browser clients can read session history directly from Supabase while Atlas is offline.', now() - interval '3 minutes'),
  ('atlas', 'Tasks and Devices surfaces added', 'Both tabs now have durable cloud-backed starting views.', now() - interval '2 minutes'),
  ('bindex', 'Pricing pipeline refined', 'Refresh work remains focused on owned cards rather than the full catalog.', now() - interval '2 days'),
  ('short-films', 'Unsent Letters interaction revised', 'The central exchange shifted toward reflection through an outside perspective.', now() - interval '3 days'),
  ('cs445', 'Project proposal approved', 'ATLAS is the individual AI project for the semester.', now() - interval '10 days')
) as seed(project_id, title, detail, happened_at)
where not exists (select 1 from public.atlas_project_history existing where existing.project_id=seed.project_id and existing.title=seed.title);

insert into public.atlas_project_files (project_id, path, description, kind, note, sort_order)
values
  ('atlas', 'renderer/components/atlas-app.tsx', 'Shared application shell and top-level view switching.', 'code', 'Core UI', 10),
  ('atlas', 'renderer/lib/web-atlas-bridge.ts', 'Browser implementation of the Electron-compatible Atlas bridge.', 'code', 'AI connection', 20),
  ('atlas', 'renderer/lib/atlas-cloud.ts', 'Browser-safe Supabase client for persistent cross-device state.', 'code', 'Cloud state', 30),
  ('atlas', 'backend/src/server.js', 'Atlas HTTP and WebSocket host for Alice and local execution.', 'code', 'Compute host', 40),
  ('atlas', 'docs/PWA_SETUP.md', 'Mac/iOS development and Tailscale setup notes.', 'document', 'Setup guide', 50),
  ('short-films', 'okurenai_tegami_script.docx', 'Canonical surviving screenplay for Unsent Letters.', 'document', 'Reference', 10)
on conflict (project_id, path) do update set description=excluded.description, kind=excluded.kind, note=excluded.note, sort_order=excluded.sort_order;

commit;
