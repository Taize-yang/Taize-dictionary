-- ============================================================
-- Only administrators may soft-delete terms.
-- Regular authenticated users can still add/edit terms, but a
-- transition to deleted = true is rejected at the database level.
-- service_role (seed/backup jobs) is allowed to bypass the guard.
-- ============================================================

create or replace function public.guard_term_delete()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.deleted is distinct from old.deleted and new.deleted then
    if not (public.is_admin() or auth.role() = 'service_role') then
      raise exception 'only administrators can delete terms'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists terms_guard_delete on public.terms;
create trigger terms_guard_delete
  before update of deleted on public.terms
  for each row execute function public.guard_term_delete();
