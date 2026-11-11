-- Allow anonymous visitors (guest mode) to read the dictionary.
-- Writes and favorites remain authenticated-only.
grant select on public.terms to anon;
grant select on public.patterns to anon;

drop policy if exists terms_select_anon on public.terms;
create policy terms_select_anon on public.terms
  for select to anon
  using (deleted = false);

drop policy if exists patterns_select_anon on public.patterns;
create policy patterns_select_anon on public.patterns
  for select to anon
  using (true);
