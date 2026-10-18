-- Compatibility storage preserves the established cinematic/rehearsal API.
create table public.ttc_legacy_records (
  key text primary key, value jsonb not null, version uuid not null default gen_random_uuid()
);
alter table public.ttc_legacy_records enable row level security;
revoke all on public.ttc_legacy_records from public, anon, authenticated;
grant all on public.ttc_legacy_records to service_role;
create function public.ttc_legacy_store(p_operation text,p_key text,p_value jsonb default null,p_etag uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; changed integer;
begin
 if p_operation='get' then select jsonb_build_object('value',value,'etag',version::text) into result from public.ttc_legacy_records where key=p_key; return result;
 elsif p_operation='create' then
  insert into public.ttc_legacy_records(key,value) values(p_key,p_value) on conflict(key) do nothing;
  get diagnostics changed = row_count; return to_jsonb(changed=1);
 elsif p_operation='replace' then
  update public.ttc_legacy_records set value=p_value,version=gen_random_uuid() where key=p_key and version=p_etag;
  get diagnostics changed = row_count; return to_jsonb(changed=1);
 elsif p_operation='put' then
  insert into public.ttc_legacy_records(key,value) values(p_key,p_value)
  on conflict(key) do update set value=excluded.value,version=gen_random_uuid(); return 'null'::jsonb;
 elsif p_operation='list' then
  return coalesce((select jsonb_agg(key order by key) from public.ttc_legacy_records where left(key,length(p_key))=p_key),'[]');
 elsif p_operation='remove' then delete from public.ttc_legacy_records where key=p_key; return 'null'::jsonb;
 end if;
 raise exception 'invalid';
end $$;
revoke all on function public.ttc_legacy_store(text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.ttc_legacy_store(text,text,jsonb,uuid) to service_role;
