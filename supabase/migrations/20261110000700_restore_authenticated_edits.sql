-- Restore editing for normal authenticated users.
-- (Deletion of terms/patterns remains administrator-only.)
drop policy if exists terms_update on public.terms;
create policy terms_update on public.terms
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists patterns_update on public.patterns;
create policy patterns_update on public.patterns
  for update to authenticated
  using (true) with check (true);
