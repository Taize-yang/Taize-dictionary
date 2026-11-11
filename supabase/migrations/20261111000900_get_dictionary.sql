-- One-round-trip dictionary snapshot for fast initial rendering.
create or replace function public.get_dictionary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'terms', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.id)
      from (
        select id, base_id, ja, reading, zh, en, cats, note, etym,
               variant, abbr, syn, deleted, updated_by
        from public.terms
        where deleted = false
      ) t
    ), '[]'::jsonb),
    'patterns', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.sort, p.id)
      from (
        select id, ja, zh, sort
        from public.patterns
      ) p
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.get_dictionary() to anon, authenticated;
