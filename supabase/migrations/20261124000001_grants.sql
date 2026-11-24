-- Table privileges for the API roles. Newer Supabase projects don't grant these automatically for tables made in
-- SQL, which shows up as "permission denied for table app_records" (42501). Row level security still decides which
-- rows each signed-in user may read or change; anonymous visitors get no access at all.

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on table public.app_records to authenticated;
grant select, insert, delete on table public.file_meta to authenticated;

grant all on table public.app_records to service_role;
grant all on table public.file_meta to service_role;

revoke all on table public.app_records from anon;
revoke all on table public.file_meta from anon;
