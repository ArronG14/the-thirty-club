-- Editing an unsent scheduled message creates a new owner-approved attempt cycle.
do $$
declare definition text;
begin
 definition := pg_get_functiondef('public.ttc_action(uuid,text,text,jsonb)'::regprocedure);
 if position('approved_at=null,next_attempt_at=null,last_error=null where id=m.id' in definition)=0 then raise exception 'Expected message edit expression was not found'; end if;
 execute replace(definition,'approved_at=null,next_attempt_at=null,last_error=null where id=m.id',
  'approved_at=null,next_attempt_at=null,last_error=null,attempts=0,provider_sid=null,claim_id=null,claimed_at=null where id=m.id');
end $$;
