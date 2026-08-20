-- HeatMan company fleet storage and realtime feed.
-- Run this once in the Supabase SQL Editor after enabling Clerk as a
-- Third-Party Auth provider for the project.

create table if not exists public.fleet_riders (
  organization_id text not null,
  rider_id text not null,
  name text not null,
  initials text not null,
  vehicle text not null check (vehicle in ('Bike', 'E-bike', 'Walk')),
  zone text not null,
  next_stop text not null,
  risk_score integer not null check (risk_score between 0 and 100),
  risk_band text not null check (risk_band in ('low', 'guarded', 'high', 'critical')),
  temperature_c numeric(5, 2) not null,
  hot_minutes integer not null default 0 check (hot_minutes >= 0),
  shift_window text not null,
  eta text not null,
  position_x numeric(6, 3) not null check (position_x between 0 and 100),
  position_y numeric(6, 3) not null check (position_y between 0 and 100),
  status text not null,
  alert_state text not null default 'none'
    check (alert_state in ('none', 'open', 'delivered', 'acknowledged')),
  last_intervention text not null default 'No intervention',
  created_by text not null default (auth.jwt()->>'sub'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, rider_id)
);

create table if not exists public.fleet_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  rider_id text,
  message text not null,
  action_type text not null default 'dispatcher_action',
  actor_user_id text not null default (auth.jwt()->>'sub'),
  created_at timestamptz not null default now()
);

create index if not exists fleet_riders_organization_risk_idx
  on public.fleet_riders (organization_id, risk_score desc);

create index if not exists fleet_activity_organization_created_idx
  on public.fleet_activity (organization_id, created_at desc);

create or replace function public.set_heatman_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_fleet_riders_updated_at on public.fleet_riders;
create trigger set_fleet_riders_updated_at
before update on public.fleet_riders
for each row execute function public.set_heatman_updated_at();

alter table public.fleet_riders enable row level security;
alter table public.fleet_activity enable row level security;

drop policy if exists "Organization members can read fleet riders" on public.fleet_riders;
create policy "Organization members can read fleet riders"
on public.fleet_riders
for select
to authenticated
using (
  organization_id = (
    select coalesce(auth.jwt()->>'org_id', auth.jwt()->'o'->>'id')
  )
);

drop policy if exists "Organization members can add fleet riders" on public.fleet_riders;
create policy "Organization members can add fleet riders"
on public.fleet_riders
for insert
to authenticated
with check (
  organization_id = (
    select coalesce(auth.jwt()->>'org_id', auth.jwt()->'o'->>'id')
  )
);

drop policy if exists "Organization members can update fleet riders" on public.fleet_riders;
create policy "Organization members can update fleet riders"
on public.fleet_riders
for update
to authenticated
using (
  organization_id = (
    select coalesce(auth.jwt()->>'org_id', auth.jwt()->'o'->>'id')
  )
)
with check (
  organization_id = (
    select coalesce(auth.jwt()->>'org_id', auth.jwt()->'o'->>'id')
  )
);

drop policy if exists "Organization members can read fleet activity" on public.fleet_activity;
create policy "Organization members can read fleet activity"
on public.fleet_activity
for select
to authenticated
using (
  organization_id = (
    select coalesce(auth.jwt()->>'org_id', auth.jwt()->'o'->>'id')
  )
);

drop policy if exists "Organization members can add fleet activity" on public.fleet_activity;
create policy "Organization members can add fleet activity"
on public.fleet_activity
for insert
to authenticated
with check (
  organization_id = (
    select coalesce(auth.jwt()->>'org_id', auth.jwt()->'o'->>'id')
  )
);

alter table public.fleet_riders replica identity full;
alter table public.fleet_activity replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'fleet_riders'
  ) then
    alter publication supabase_realtime add table public.fleet_riders;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'fleet_activity'
  ) then
    alter publication supabase_realtime add table public.fleet_activity;
  end if;
end;
$$;
