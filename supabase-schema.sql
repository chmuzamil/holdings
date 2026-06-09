create table if not exists public.founder_os_records (
  id text primary key,
  module_key text not null check (module_key in ('domains', 'servers', 'repos', 'accounts', 'subscriptions')),
  record jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.founder_os_records enable row level security;

create policy "Allow anon dashboard access"
on public.founder_os_records
for all
to anon
using (true)
with check (true);

create index if not exists founder_os_records_module_key_idx
on public.founder_os_records (module_key);
