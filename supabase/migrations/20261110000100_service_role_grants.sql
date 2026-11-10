-- ============================================================
-- Grant service_role the privileges it needs to seed / back up data.
-- (service_role bypasses RLS, but still needs table privileges.)
-- ============================================================

grant all privileges on public.profiles to service_role;
grant all privileges on public.terms to service_role;
grant all privileges on public.patterns to service_role;
grant all privileges on public.favorites to service_role;
grant all privileges on public.library_versions to service_role;

grant usage, select on all sequences in schema public to service_role;
