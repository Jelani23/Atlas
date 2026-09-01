-- Adds exact session details that do not fit safely in one short summary.

alter table reflections
    add column if not exists anchors text[] not null default '{}';

alter table reflections
    add column if not exists decisions text[] not null default '{}';

alter table reflections
    add column if not exists comparisons text[] not null default '{}';

alter table reflections
    add column if not exists open_loops text[] not null default '{}';

alter table reflections
    add column if not exists schema_version integer not null default 1;

alter table reflections
    add column if not exists source_message_count integer;

create index if not exists idx_reflections_anchors
    on reflections using gin(anchors);
