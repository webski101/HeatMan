-- Organization-scoped Firebase Cloud Messaging installations for HeatMan.

create table if not exists public.push_installations (
  organization_id text not null,
  installation_id text not null,
  user_id text not null default (auth.jwt()->>'sub'),
  device_label text not null default 'HeatMan web browser',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (organization_id, installation_id)
);

create index if not exists push_installations_user_idx
  on public.push_installations (organization_id, user_id, last_seen_at desc);

alter table public.push_installations enable row level security;

drop policy if exists "Users can read their own push installations" on public.push_installations;
create policy "Users can read their own push installations"
on public.push_installations
for select
to authenticated
using (
  organization_id = (
    select coalesce(auth.jwt()->>'org_id', auth.jwt()->'o'->>'id')
  )
  and user_id = (select auth.jwt()->>'sub')
);

drop policy if exists "Users can add their own push installations" on public.push_installations;
create policy "Users can add their own push installations"
on public.push_installations
for insert
to authenticated
with check (
  organization_id = (
    select coalesce(auth.jwt()->>'org_id', auth.jwt()->'o'->>'id')
  )
  and user_id = (select auth.jwt()->>'sub')
);

drop policy if exists "Users can refresh their own push installations" on public.push_installations;
create policy "Users can refresh their own push installations"
on public.push_installations
for update
to authenticated
using (
  organization_id = (
    select coalesce(auth.jwt()->>'org_id', auth.jwt()->'o'->>'id')
  )
  and user_id = (select auth.jwt()->>'sub')
)
with check (
  organization_id = (
    select coalesce(auth.jwt()->>'org_id', auth.jwt()->'o'->>'id')
  )
  and user_id = (select auth.jwt()->>'sub')
);

drop policy if exists "Users can remove their own push installations" on public.push_installations;
create policy "Users can remove their own push installations"
on public.push_installations
for delete
to authenticated
using (
  organization_id = (
    select coalesce(auth.jwt()->>'org_id', auth.jwt()->'o'->>'id')
  )
  and user_id = (select auth.jwt()->>'sub')
);
