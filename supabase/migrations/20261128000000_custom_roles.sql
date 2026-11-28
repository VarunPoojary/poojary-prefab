-- Custom roles (Settings → Roles and access).
--
-- Before: payroll records could only be written by the fixed roles 'admin' and 'accountant'.
-- Now: by Admin, or by any role whose pages (stored in the settings record, data -> 'roles') include Payroll.
-- Logins, employees, lookups and settings stay Admin-only. Everything else is unchanged.
--
-- Run after 20261124000000_init.sql and 20261124000001_grants.sql (Supabase → SQL Editor, or `supabase db push`).

-- True when the role may open the page. Admin: always. Other roles: the page is in the role's list in
-- the settings record. Settings saved before custom roles have no 'roles' list; then the starting roles
-- apply (the Accountant has Payroll and Expenses).
create or replace function public.app_role_has_page(role text, page text) returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when role is null then false
    when role = 'admin' then true
    when exists (
      select 1 from public.app_records s
      where s.collection = 'pppl.settings.v1' and jsonb_typeof(s.data -> 'roles') = 'array'
    ) then exists (
      select 1
      from public.app_records s, jsonb_array_elements(s.data -> 'roles') r
      where s.collection = 'pppl.settings.v1'
        and r ->> 'id' = role
        and (r -> 'pages') ? page
    )
    else role = 'accountant' and page in ('payroll', 'expenses')
  end
$$;

revoke all on function public.app_role_has_page(text, text) from public;
grant execute on function public.app_role_has_page(text, text) to authenticated;

-- Same rules as before, with payroll opened up to roles that have the Payroll page.
-- (Now reads the settings record, so it is STABLE instead of IMMUTABLE.)
create or replace function public.app_can_write(collection text, role text) returns boolean
language sql stable
as $$
  select case
    when role is null then false
    when collection in ('pppl.logins.v1', 'pppl.employees.v1', 'pppl.lookups.v1', 'pppl.settings.v1')
      then role = 'admin'
    when collection like 'pppl.payroll-%'
      then public.app_role_has_page(role, 'payroll')
    else true
  end
$$;

grant execute on function public.app_can_write(text, text) to authenticated;
