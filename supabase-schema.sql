create table if not exists public.founder_os_records (
  id text primary key,
  user_id uuid not null default auth.uid(),
  module_key text not null check (module_key in ('domains', 'servers', 'repos', 'accounts', 'subscriptions', 'projects')),
  record jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.founder_os_records
add column if not exists user_id uuid default auth.uid();

alter table public.founder_os_records enable row level security;

drop policy if exists "Allow anon dashboard access" on public.founder_os_records;
drop policy if exists "Allow authenticated owner access" on public.founder_os_records;

create policy "Allow authenticated owner access"
on public.founder_os_records
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create index if not exists founder_os_records_module_key_idx
on public.founder_os_records (module_key);

create table if not exists public.founder_os_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  github_username text not null default '',
  github_api_base text not null default 'https://api.github.com',
  github_token text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.founder_os_settings enable row level security;

drop policy if exists "Allow authenticated owner settings access" on public.founder_os_settings;

create policy "Allow authenticated owner settings access"
on public.founder_os_settings
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
