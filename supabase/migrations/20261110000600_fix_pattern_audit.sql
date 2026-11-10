-- Fix audit trigger for patterns: pattern rows have no "deleted" column.
create or replace function public.log_table_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_action text;
  v_before jsonb;
  v_after jsonb;
  v_record bigint;
begin
  if v_uid is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    v_action := 'insert';
    v_before := null;
    v_after := to_jsonb(new);
  elsif tg_op = 'DELETE' then
    v_action := 'delete';
    v_before := to_jsonb(old);
    v_after := null;
  else
    if tg_table_name = 'terms' then
      if new.deleted and not old.deleted then
        v_action := 'delete';
      else
        v_action := 'update';
      end if;
    else
      v_action := 'update';
    end if;
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
  end if;

  v_record := coalesce((v_after->>'id')::bigint, (v_before->>'id')::bigint);
  select username into v_name from public.profiles where id = v_uid;

  insert into public.audit_log
    (table_name, record_id, action, before, after, changed_by, changed_by_name)
  values
    (tg_table_name, v_record, v_action, v_before, v_after, v_uid, v_name);

  return coalesce(new, old);
end;
$$;
