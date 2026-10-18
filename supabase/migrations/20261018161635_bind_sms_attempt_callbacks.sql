-- Bind callbacks to a send attempt. Old callbacks must not mutate an explicit retry.
do $$
declare definition text;
begin
 definition := pg_get_functiondef('public.ttc_action(uuid,text,text,jsonb)'::regprocedure);
 if position('claim_id=gen_random_uuid(),attempts=attempts+1' in definition)=0 then raise exception 'Expected message claim expression was not found'; end if;
 definition := replace(definition,'claim_id=gen_random_uuid(),attempts=attempts+1','claim_id=gen_random_uuid(),provider_sid=null,attempts=attempts+1');
 definition := replace(definition,$old$if m.state in ('delivered','failed') and m.provider_sid is not null then return '{"ok":true}'; end if;$old$,
  $new$if m.state in ('accepted','delivered','failed') and m.provider_sid is not null then
    if p_input->>'providerSid' is not null and m.provider_sid<>p_input->>'providerSid' then perform public.ttc_fail('conflict'); end if;
    return '{"ok":true}';
   end if;$new$);
 definition := replace(definition,$old$if m.id is null then perform public.ttc_fail('not-found'); end if;
   if m.state not in ('sending','accepted','delivered','uncertain','failed')$old$,
  $new$if m.id is null then perform public.ttc_fail('not-found'); end if;
   if m.claim_id is distinct from (p_input->>'claimId')::uuid then return '{"ok":true}'; end if;
   if m.state not in ('sending','accepted','delivered','uncertain','failed')$new$);
 execute definition;
end $$;
