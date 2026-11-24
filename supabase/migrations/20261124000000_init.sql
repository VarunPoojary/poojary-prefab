-- Poojary Prefab – Supabase schema (run once: Supabase dashboard → SQL editor, or `supabase db push`).
--
-- Every module keeps its records in one table, one row per record, as JSONB:
--   collection = the module's list (e.g. 'pppl.projects.v1'), id = the record id, data = the record.
-- Single values (counters, lookups, settings) are one row with id '$value'.
-- Uploaded files live in the private Storage bucket 'files'; their metadata in file_meta.

create table if not exists public.app_records (
  collection  text        not null,
  id          text        not null,
  data        jsonb       not null,
  -- Keeps the order of each list (fractional, so inserts never renumber other rows).
  pos         double precision not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid        default auth.uid(),
  -- Browser tab that wrote the row, so a tab can ignore the realtime echo of its own writes.
  client_id   text,
  primary key (collection, id)
);

create index if not exists app_records_collection_pos on public.app_records (collection, pos);

create table if not exists public.file_meta (
  id          text primary key,
  name        text not null,
  type        text not null,
  size        bigint not null,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);

-- ---------------------------------------------------------------------------------------------
-- Who is signed in: the Supabase Auth user carries the employee id in app_metadata (set by the
-- server, never by the user). The role and the enabled flag come from the app's login record.
-- ---------------------------------------------------------------------------------------------

create or replace function public.app_employee_id() returns text
language sql stable
as $$ select nullif(auth.jwt() -> 'app_metadata' ->> 'employee_id', '') $$;

create or replace function public.app_role() returns text
language sql stable security definer set search_path = public
as $$
  select r.data ->> 'role'
  from public.app_records r
  where r.collection = 'pppl.logins.v1'
    and r.id = public.app_employee_id()
    and coalesce((r.data ->> 'enabled')::boolean, false)
$$;

revoke all on function public.app_role() from public;
grant execute on function public.app_role() to authenticated;
grant execute on function public.app_employee_id() to authenticated;

-- Collections only some roles may change. Everything else can be changed by any enabled login
-- (the detailed per-record rules still run in the app; see README → Architecture & data).
-- The role is passed in so each policy looks it up once per query, not once per row.
create or replace function public.app_can_write(collection text, role text) returns boolean
language sql immutable
as $$
  select case
    when role is null then false
    when collection in ('pppl.logins.v1', 'pppl.employees.v1', 'pppl.lookups.v1', 'pppl.settings.v1')
      then role = 'admin'
    when collection like 'pppl.payroll-%'
      then role in ('admin', 'accountant')
    else true
  end
$$;

grant execute on function public.app_can_write(text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------------------------

alter table public.app_records enable row level security;
alter table public.file_meta enable row level security;

drop policy if exists "signed-in users read records" on public.app_records;
create policy "signed-in users read records" on public.app_records
  for select to authenticated using ((select public.app_role()) is not null);

drop policy if exists "allowed roles insert records" on public.app_records;
create policy "allowed roles insert records" on public.app_records
  for insert to authenticated with check (public.app_can_write(collection, (select public.app_role())));

drop policy if exists "allowed roles update records" on public.app_records;
create policy "allowed roles update records" on public.app_records
  for update to authenticated using (public.app_can_write(collection, (select public.app_role()))) with check (public.app_can_write(collection, (select public.app_role())));

drop policy if exists "allowed roles delete records" on public.app_records;
create policy "allowed roles delete records" on public.app_records
  for delete to authenticated using (public.app_can_write(collection, (select public.app_role())));

drop policy if exists "signed-in users read files" on public.file_meta;
create policy "signed-in users read files" on public.file_meta
  for select to authenticated using ((select public.app_role()) is not null);

drop policy if exists "signed-in users add files" on public.file_meta;
create policy "signed-in users add files" on public.file_meta
  for insert to authenticated with check ((select public.app_role()) is not null);

drop policy if exists "signed-in users remove files" on public.file_meta;
create policy "signed-in users remove files" on public.file_meta
  for delete to authenticated using ((select public.app_role()) is not null);

-- Realtime: other users' changes reach every open tab.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_records'
  ) then
    alter publication supabase_realtime add table public.app_records;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Storage bucket for uploads (private; 10 MB per file like the app's own limit)
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 10485760)
on conflict (id) do nothing;

drop policy if exists "signed-in users read files" on storage.objects;
create policy "signed-in users read files" on storage.objects
  for select to authenticated using (bucket_id = 'files' and (select public.app_role()) is not null);

drop policy if exists "signed-in users upload files" on storage.objects;
create policy "signed-in users upload files" on storage.objects
  for insert to authenticated with check (bucket_id = 'files' and (select public.app_role()) is not null);

drop policy if exists "signed-in users delete files" on storage.objects;
create policy "signed-in users delete files" on storage.objects
  for delete to authenticated using (bucket_id = 'files' and (select public.app_role()) is not null);
