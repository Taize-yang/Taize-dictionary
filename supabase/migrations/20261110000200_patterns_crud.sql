-- ============================================================
-- Business patterns: authenticated users may add / edit;
-- deleting patterns is admin-only (matching the admin bulk UI).
-- Also give patterns.id a sequence so INSERTs don't need explicit ids.
-- ============================================================

create sequence if not exists public.patterns_id_seq;
alter sequence public.patterns_id_seq owned by public.patterns.id;

select setval(
  'public.patterns_id_seq',
  coalesce((select max(id) from public.patterns), 0) + 1,
  false
);

alter table public.patterns
  alter column id set default nextval('public.patterns_id_seq');

grant usage, select on sequence public.patterns_id_seq to authenticated;
grant usage, select on sequence public.patterns_id_seq to service_role;

grant insert, update, delete on public.patterns to authenticated;

drop policy if exists patterns_admin_write on public.patterns;
drop policy if exists patterns_insert on public.patterns;
drop policy if exists patterns_update on public.patterns;
drop policy if exists patterns_delete on public.patterns;

create policy patterns_insert on public.patterns
  for insert to authenticated
  with check (true);

create policy patterns_update on public.patterns
  for update to authenticated
  using (true) with check (true);

create policy patterns_delete on public.patterns
  for delete to authenticated
  using (public.is_admin());
