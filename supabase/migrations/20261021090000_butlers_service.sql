-- The Butler's Service (docs/BUTLERS_SERVICE.md). Builds on the
-- Correspondence Desk rather than beside it:
--
-- * "A Word with the Butler" from the service bell is stored in the existing
--   ttc_letter_replies table with no letter (letter_id null), with the same
--   idempotency keys, rate limits and approved SMS-to-Arron outbox message.
-- * Arron's responses (a short Butler SMS, or a letter written on the Desk)
--   are linked to the request in ttc_request_responses. A request can be
--   marked resolved; nothing marks it resolved automatically.
-- * Arron's direct SMS to Alise are ordinary approved outbox messages in the
--   existing correspondence-alise category, so the existing claim, backoff,
--   uncertain hold, six-hour expiry, callbacks, retry and the global
--   SMS_SENDING_ENABLED switch all apply unchanged.
--
-- A separate RPC, so ttc_action, ttc_vault_action and
-- ttc_correspondence_action are unchanged. No existing column is removed.

alter table public.ttc_letter_replies alter column letter_id drop not null;
alter table public.ttc_letter_replies add column resolved_at timestamptz;
create index ttc_letter_replies_created_idx on public.ttc_letter_replies(created_at desc);

create table public.ttc_request_responses (
  id uuid primary key default gen_random_uuid(),
  reply_id uuid not null references public.ttc_letter_replies(id),
  kind text not null check (kind in ('sms','letter')),
  message_id uuid unique references public.ttc_messages(id),
  -- A draft letter may later be deleted from the Desk; the link then reads
  -- as "letter withdrawn" rather than blocking the deletion.
  letter_id uuid unique references public.ttc_letters(id) on delete set null,
  idempotency_key text not null unique check (idempotency_key ~ '^[A-Za-z0-9_-]{8,80}$'),
  created_at timestamptz not null default now(),
  check (kind <> 'sms' or message_id is not null),
  check (kind <> 'letter' or message_id is null)
);
create index ttc_request_responses_reply_idx on public.ttc_request_responses(reply_id, created_at);

create table public.ttc_direct_messages (
  message_id uuid primary key references public.ttc_messages(id),
  idempotency_key text not null unique check (idempotency_key ~ '^[A-Za-z0-9_-]{8,80}$'),
  created_at timestamptz not null default now()
);

create function public.ttc_request_member_json(r public.ttc_letter_replies) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object('id',r.id,'body',r.body,'createdAt',r.created_at,'resolvedAt',r.resolved_at)
$$;

create function public.ttc_request_owner_json(r public.ttc_letter_replies) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object('id',r.id,'body',r.body,'createdAt',r.created_at,'resolvedAt',r.resolved_at,
  'source',case when r.letter_id is null then 'service' else 'letter' end,
  'letter',(select jsonb_build_object('id',l.id,'title',l.title) from public.ttc_letters l where l.id=r.letter_id),
  'notificationSms',public.ttc_letter_sms_json(r.notification_message_id),
  'responses',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'kind',x.kind,'createdAt',x.created_at,
      'sms',case when x.message_id is null then null
                 else public.ttc_letter_sms_json(x.message_id)
                      || jsonb_build_object('body',(select m.body from public.ttc_messages m where m.id=x.message_id)) end,
      'letter',(select jsonb_build_object('id',l.id,'title',l.title,'state',l.state,'status',public.ttc_letter_status(l),
                  'deliverAt',l.deliver_at,'publishedAt',l.published_at)
                from public.ttc_letters l where l.id=x.letter_id))
     order by x.created_at) from public.ttc_request_responses x where x.reply_id=r.id),'[]'))
$$;

create function public.ttc_direct_message_json(m public.ttc_messages) returns jsonb
language sql stable set search_path = '' as $$
 select public.ttc_message_json(m) || jsonb_build_object('createdAt',m.created_at)
$$;

create function public.ttc_service_action(p_actor uuid, p_role text, p_action text, p_input jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 member uuid; r public.ttc_letter_replies; m public.ttc_messages; x public.ttc_request_responses;
 l public.ttc_letters; d public.ttc_direct_messages; recent integer; note text; mid uuid; at timestamptz;
begin
 select id into member from public.ttc_members where slug='alise' and enabled;
 if member is null then perform public.ttc_fail('not-configured'); end if;
 if p_role is null or p_role not in ('owner','member') then perform public.ttc_fail('forbidden'); end if;
 if p_role='member' and (p_actor is distinct from member) then perform public.ttc_fail('forbidden'); end if;
 if p_action like 'owner-%' and p_role<>'owner' then perform public.ttc_fail('forbidden'); end if;
 if p_action like 'service-%' and p_role<>'member' then perform public.ttc_fail('forbidden'); end if;

 if p_action='service-request' then
   -- One message at a time per member, so the shared limits cannot be raced.
   perform 1 from public.ttc_members where id=member for update;
   select * into r from public.ttc_letter_replies where member_id=member and idempotency_key=p_input->>'idempotencyKey';
   if r.id is not null then
     if r.letter_id is not null or r.body<>p_input->>'body' then perform public.ttc_fail('idempotency-conflict'); end if;
     return jsonb_build_object('request',public.ttc_request_member_json(r),'duplicate',true);
   end if;
   if length(btrim(coalesce(p_input->>'body',''))) not between 1 and 1000 then perform public.ttc_fail('invalid'); end if;
   -- The same words moments apart are one request.
   select * into r from public.ttc_letter_replies where member_id=member and letter_id is null
     and body=p_input->>'body' and created_at > now() - interval '10 minutes' order by created_at desc limit 1;
   if r.id is not null then
     return jsonb_build_object('request',public.ttc_request_member_json(r),'duplicate',true);
   end if;
   -- The Desk's limits, counted across letter replies and requests together.
   select count(*) into recent from public.ttc_letter_replies where member_id=member and created_at > now() - interval '10 minutes';
   if recent >= 5 then perform public.ttc_fail('rate-limited'); end if;
   select count(*) into recent from public.ttc_letter_replies where member_id=member and created_at > now() - interval '24 hours';
   if recent >= 40 then perform public.ttc_fail('rate-limited'); end if;
   note := coalesce(p_input->>'notification','');
   if position('{message}' in note) = 0 then perform public.ttc_fail('not-configured'); end if;
   note := replace(note,'{message}',p_input->>'body');
   insert into public.ttc_messages(label,body,category,send_at,timezone,state,approved_at,next_attempt_at)
     values('Request from Alise',left(note,1600),'correspondence-arron',now(),'Europe/London','approved',now(),now())
     returning id into mid;
   insert into public.ttc_letter_replies(letter_id,member_id,body,idempotency_key,notification_message_id)
     values(null,member,p_input->>'body',p_input->>'idempotencyKey',mid) returning * into r;
   -- Activity records that a request exists, never its words.
   insert into public.ttc_activity_events(type,detail) values('service.request',jsonb_build_object('replyId',r.id,'messageId',mid));
   return jsonb_build_object('request',public.ttc_request_member_json(r),'duplicate',false);

 elsif p_action='service-requests' then
   return jsonb_build_object('requests',coalesce((select jsonb_agg(public.ttc_request_member_json(y) order by y.created_at desc)
     from (select * from public.ttc_letter_replies where member_id=member and letter_id is null
           order by created_at desc limit 50) y),'[]'));

 elsif p_action='owner-requests-list' then
   return jsonb_build_object('requests',coalesce((select jsonb_agg(public.ttc_request_owner_json(y) order by y.created_at desc)
     from (select * from public.ttc_letter_replies order by created_at desc limit 200) y),'[]'));

 elsif p_action in ('owner-request-sms','owner-request-letter','owner-request-resolve') then
   select * into r from public.ttc_letter_replies where id=(p_input->>'id')::uuid for update;
   if r.id is null then perform public.ttc_fail('not-found'); end if;
   if p_action='owner-request-resolve' then
     if jsonb_typeof(p_input->'resolved') is distinct from 'boolean' then perform public.ttc_fail('invalid'); end if;
     update public.ttc_letter_replies
       set resolved_at=case when (p_input->>'resolved')::boolean then coalesce(resolved_at,now()) else null end
       where id=r.id returning * into r;
     insert into public.ttc_activity_events(type,detail)
       values(case when r.resolved_at is null then 'service.reopened' else 'service.resolved' end,jsonb_build_object('replyId',r.id));
     return jsonb_build_object('request',public.ttc_request_owner_json(r),'duplicate',false);
   end if;
   select * into x from public.ttc_request_responses where idempotency_key=p_input->>'idempotencyKey';
   if x.id is not null then
     if x.reply_id<>r.id or x.kind<>(case when p_action='owner-request-sms' then 'sms' else 'letter' end) then
       perform public.ttc_fail('idempotency-conflict');
     end if;
     return jsonb_build_object('request',public.ttc_request_owner_json(r),'duplicate',true);
   end if;
   if p_action='owner-request-sms' then
     if length(btrim(coalesce(p_input->>'body',''))) not between 1 and 1600 then perform public.ttc_fail('invalid'); end if;
     insert into public.ttc_messages(label,body,category,send_at,timezone,state,approved_at,next_attempt_at)
       values('Butler’s reply to a request',p_input->>'body','correspondence-alise',now(),'Europe/London','approved',now(),now())
       returning id into mid;
     insert into public.ttc_request_responses(reply_id,kind,message_id,idempotency_key)
       values(r.id,'sms',mid,p_input->>'idempotencyKey');
     insert into public.ttc_activity_events(type,detail) values('service.replied-sms',jsonb_build_object('replyId',r.id,'messageId',mid));
   else
     select * into l from public.ttc_letters where id=(p_input->>'letterId')::uuid;
     if l.id is null then perform public.ttc_fail('not-found'); end if;
     if exists(select 1 from public.ttc_request_responses where letter_id=l.id) then perform public.ttc_fail('conflict'); end if;
     insert into public.ttc_request_responses(reply_id,kind,letter_id,idempotency_key)
       values(r.id,'letter',l.id,p_input->>'idempotencyKey');
     insert into public.ttc_activity_events(type,detail) values('service.replied-letter',jsonb_build_object('replyId',r.id,'letterId',l.id));
   end if;
   return jsonb_build_object('request',public.ttc_request_owner_json(r),'duplicate',false);

 elsif p_action='owner-direct-sms-list' then
   return jsonb_build_object('messages',coalesce((select jsonb_agg(public.ttc_direct_message_json(y) order by y.created_at desc)
     from (select m2.* from public.ttc_messages m2 join public.ttc_direct_messages d2 on d2.message_id=m2.id
           order by m2.created_at desc limit 100) y),'[]'));

 elsif p_action='owner-direct-sms-create' then
   select * into d from public.ttc_direct_messages where idempotency_key=p_input->>'idempotencyKey';
   if d.message_id is not null then
     select * into m from public.ttc_messages where id=d.message_id;
     if m.body<>p_input->>'body' then perform public.ttc_fail('idempotency-conflict'); end if;
     return jsonb_build_object('message',public.ttc_direct_message_json(m),'duplicate',true);
   end if;
   if length(btrim(coalesce(p_input->>'body',''))) not between 1 and 1600 then perform public.ttc_fail('invalid'); end if;
   if coalesce(p_input->>'timezone','') not in ('Europe/London','America/Jamaica') then perform public.ttc_fail('invalid'); end if;
   at := coalesce((p_input->>'sendAt')::timestamptz, now());
   -- A scheduled time must be in the future (a minute's grace for the form)
   -- and within the holiday; "send now" is a null sendAt.
   if at < now() - interval '1 minute' or at > now() + interval '60 days' then perform public.ttc_fail('invalid'); end if;
   at := greatest(at, now());
   insert into public.ttc_messages(label,body,category,send_at,timezone,state,approved_at,next_attempt_at)
     values('Butler’s note to Alise',p_input->>'body','correspondence-alise',at,p_input->>'timezone','approved',now(),at)
     returning * into m;
   insert into public.ttc_direct_messages(message_id,idempotency_key) values(m.id,p_input->>'idempotencyKey');
   insert into public.ttc_activity_events(type,detail)
     values('service.direct-sms',jsonb_build_object('messageId',m.id,'sendAt',m.send_at));
   return jsonb_build_object('message',public.ttc_direct_message_json(m),'duplicate',false);

 elsif p_action='owner-direct-sms-cancel' then
   if not exists(select 1 from public.ttc_direct_messages where message_id=(p_input->>'id')::uuid) then
     perform public.ttc_fail('not-found');
   end if;
   select * into m from public.ttc_messages where id=(p_input->>'id')::uuid for update;
   -- Only a message the worker has not claimed can be withdrawn. Once it is
   -- sending (or sent, or uncertain) it may already be on her phone.
   if m.state<>'approved' then perform public.ttc_fail('conflict'); end if;
   update public.ttc_messages set state='cancelled', approved_at=null,
     last_error='Cancelled by Arron before it was sent.' where id=m.id returning * into m;
   insert into public.ttc_activity_events(type,detail) values('service.direct-sms-cancelled',jsonb_build_object('messageId',m.id));
   return jsonb_build_object('message',public.ttc_direct_message_json(m));
 end if;
 perform public.ttc_fail('not-found'); return null;
end $$;

alter table public.ttc_request_responses enable row level security;
alter table public.ttc_direct_messages enable row level security;
revoke all on public.ttc_request_responses, public.ttc_direct_messages from public, anon, authenticated;
grant all on public.ttc_request_responses, public.ttc_direct_messages to service_role;
create policy service_only on public.ttc_request_responses for all to service_role using (true) with check (true);
create policy service_only on public.ttc_direct_messages for all to service_role using (true) with check (true);
do $$ declare obj record; begin
 for obj in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and (p.proname like 'ttc_request%' or p.proname like 'ttc_service%' or p.proname like 'ttc_direct%') loop
   execute format('revoke all on function %s from public, anon, authenticated',obj.signature);
   execute format('grant execute on function %s to service_role',obj.signature);
 end loop;
end $$;
