-- Preserve the applied migration history while qualifying the JSON column.
do $$
declare definition text;
begin
 definition := pg_get_functiondef('public.ttc_action(uuid,text,text,jsonb)'::regprocedure);
 if position('and result->>' in definition)=0 then raise exception 'Expected slot context expression was not found'; end if;
 execute replace(definition,'and result->>','and ttc_slot_plays.result->>');
end $$;
