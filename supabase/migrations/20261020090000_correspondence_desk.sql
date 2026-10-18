-- The Correspondence Desk (docs/CORRESPONDENCE_DESK.md). Arron writes and
-- schedules letters; the server publishes each one at its instant and queues
-- the Butler's SMS through the existing approved outbox (ttc_messages), which
-- the existing every-minute dispatch sends only while SMS_SENDING_ENABLED.
-- A separate RPC, so ttc_action and ttc_vault_action are unchanged.
--
-- Letter lifecycle: draft -> scheduled -> published (opened and thanked are
-- timestamps on a published letter). SMS state lives only in ttc_messages,
-- so an SMS failure can never hide or unpublish a letter.

alter table public.ttc_messages drop constraint ttc_messages_category_check;
alter table public.ttc_messages add constraint ttc_messages_category_check
  check (category in ('scheduled-alise','transactional-arron','correspondence-alise','correspondence-arron'));

create table public.ttc_letters (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.ttc_members(id),
  title text not null check (length(btrim(title)) between 1 and 120),
  salutation text not null default 'Dearest Alise,' check (length(btrim(salutation)) between 1 and 80),
  body text not null default '' check (length(body) <= 8000),
  timezone text not null default 'Europe/London' check (timezone in ('Europe/London','America/Jamaica')),
  deliver_at timestamptz,
  state text not null default 'draft' check (state in ('draft','scheduled','published')),
  scheduled_at timestamptz,
  published_at timestamptz,
  published_via text check (published_via in ('schedule','send-now')),
  opened_at timestamptz,
  thanked_at timestamptz,
  invitation_template text check (invitation_template in ('morning','afternoon','evening','night')),
  invitation_message_id uuid unique references public.ttc_messages(id),
  thanks_message_id uuid unique references public.ttc_messages(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (state = 'draft' or (deliver_at is not null and length(btrim(body)) > 0)),
  check ((state = 'published') = (published_at is not null)),
  check ((state = 'published') = (invitation_message_id is not null)),
  check (opened_at is null or state = 'published'),
  check (thanked_at is null or opened_at is not null),
  check ((thanked_at is null) = (thanks_message_id is null))
);
create index ttc_letters_due_idx on public.ttc_letters(deliver_at) where state = 'scheduled';
create index ttc_letters_published_idx on public.ttc_letters(member_id, published_at desc) where state = 'published';

create table public.ttc_letter_replies (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null references public.ttc_letters(id),
  member_id uuid not null references public.ttc_members(id),
  body text not null check (length(btrim(body)) between 1 and 1000),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{8,80}$'),
  notification_message_id uuid unique not null references public.ttc_messages(id),
  created_at timestamptz not null default now(),
  unique (member_id, idempotency_key)
);
create index ttc_letter_replies_letter_idx on public.ttc_letter_replies(letter_id, created_at desc);
create index ttc_letter_replies_recent_idx on public.ttc_letter_replies(member_id, created_at desc);

create function public.ttc_letter_status(l public.ttc_letters) returns text
language sql immutable set search_path = '' as $$
 select case when l.thanked_at is not null then 'thanked'
             when l.opened_at is not null then 'opened'
             else l.state end
$$;

-- The Butler's invitation is chosen by the delivery hour in the letter's zone.
create function public.ttc_letter_slot(p_at timestamptz, p_zone text) returns text
language sql stable set search_path = '' as $$
 select case when h between 5 and 11 then 'morning'
             when h between 12 and 16 then 'afternoon'
             when h between 17 and 21 then 'evening'
             else 'night' end
 from (select extract(hour from (p_at at time zone p_zone))::integer as h) x
$$;

create function public.ttc_letter_sms_json(message_id uuid) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object('id',m.id,'state',m.state,'attempts',m.attempts,
  'sendAt',m.send_at,'providerSid',m.provider_sid,'lastError',m.last_error)
 from public.ttc_messages m where m.id = message_id
$$;

create function public.ttc_letter_member_json(l public.ttc_letters) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object('id',l.id,'title',l.title,'salutation',l.salutation,'body',l.body,
  'timezone',l.timezone,'deliveredAt',l.published_at,'openedAt',l.opened_at,'thankedAt',l.thanked_at,
  'status',public.ttc_letter_status(l),
  'replies',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'body',r.body,'createdAt',r.created_at) order by r.created_at)
     from public.ttc_letter_replies r where r.letter_id = l.id),'[]'))
$$;

create function public.ttc_letter_owner_json(l public.ttc_letters) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object('id',l.id,'title',l.title,'salutation',l.salutation,'body',l.body,
  'timezone',l.timezone,'deliverAt',l.deliver_at,'state',l.state,'status',public.ttc_letter_status(l),
  'scheduledAt',l.scheduled_at,'publishedAt',l.published_at,'publishedVia',l.published_via,
  'openedAt',l.opened_at,'thankedAt',l.thanked_at,'invitationTemplate',l.invitation_template,
  'invitationSms',public.ttc_letter_sms_json(l.invitation_message_id),
  'thanksSms',public.ttc_letter_sms_json(l.thanks_message_id),
  'createdAt',l.created_at,'updatedAt',l.updated_at,
  'replies',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'body',r.body,'createdAt',r.created_at,
       'notificationSms',public.ttc_letter_sms_json(r.notification_message_id)) order by r.created_at desc)
     from public.ttc_letter_replies r where r.letter_id = l.id),'[]'))
$$;

-- Publishes one locked letter: the letter becomes visible and the Butler's
-- invitation is queued as an approved outbox message in the same transaction.
create function public.ttc_letter_publish(p_id uuid, p_templates jsonb, p_via text) returns void
language plpgsql security invoker set search_path = '' as $$
declare l public.ttc_letters; slot text; sms text; mid uuid;
begin
 select * into l from public.ttc_letters where id = p_id;
 slot := public.ttc_letter_slot(l.deliver_at, l.timezone);
 sms := p_templates->>slot;
 if sms is null or length(btrim(sms)) = 0 or length(sms) > 1600 then perform public.ttc_fail('not-configured'); end if;
 insert into public.ttc_messages(label,body,category,send_at,timezone,state,approved_at,next_attempt_at)
   values(left('Letter · '||l.title,100),sms,'correspondence-alise',now(),l.timezone,'approved',now(),now())
   returning id into mid;
 update public.ttc_letters set state='published', published_at=now(), published_via=p_via,
   invitation_template=slot, invitation_message_id=mid, updated_at=now() where id = l.id;
 insert into public.ttc_activity_events(type,detail)
   values('correspondence.published',jsonb_build_object('letterId',l.id,'via',p_via,'template',slot,'messageId',mid));
end $$;

-- Due letters are published by the existing every-minute round and, as a
-- safety net, lazily on any correspondence read. Row locks with SKIP LOCKED
-- and the state guard make concurrent or repeated runs publish each once.
create function public.ttc_correspondence_publish_due(p_templates jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare l record; n integer := 0;
begin
 -- A Butler SMS to Alise that has not gone within six hours is stale: it is
 -- marked failed (truthfully) and can be resent from the Desk if still wanted.
 with stale as (
   update public.ttc_messages set state='failed', approved_at=null,
     last_error='Not sent within six hours; resend from the Correspondence Desk if still wanted.'
   where category='correspondence-alise' and state='approved' and send_at < now() - interval '6 hours'
   returning id)
 insert into public.ttc_message_delivery_logs(message_id,state,error)
   select id,'failed','Expired unsent after six hours' from stale;
 for l in select id from public.ttc_letters where state='scheduled' and deliver_at <= now()
     order by deliver_at limit 25 for update skip locked loop
   perform public.ttc_letter_publish(l.id, p_templates, 'schedule');
   n := n + 1;
 end loop;
 return n;
end $$;

create function public.ttc_correspondence_action(p_actor uuid, p_role text, p_action text, p_input jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 member uuid; l public.ttc_letters; m public.ttc_messages; r public.ttc_letter_replies;
 published integer; recent integer; note text; mid uuid; deliver timestamptz;
begin
 select id into member from public.ttc_members where slug='alise' and enabled;
 if member is null then perform public.ttc_fail('not-configured'); end if;
 if p_role not in ('system','owner','member') or p_role is null then perform public.ttc_fail('forbidden'); end if;
 if p_role='member' and (p_actor is distinct from member) then perform public.ttc_fail('forbidden'); end if;
 if p_action like 'owner-%' and p_role<>'owner' then perform public.ttc_fail('forbidden'); end if;
 if p_action like 'system-%' and p_role<>'system' then perform public.ttc_fail('forbidden'); end if;
 if p_action like 'correspondence-%' and p_role<>'member' then perform public.ttc_fail('forbidden'); end if;
 if jsonb_typeof(p_input->'templates') is distinct from 'object' then perform public.ttc_fail('not-configured'); end if;
 published := public.ttc_correspondence_publish_due(p_input->'templates');

 if p_action='system-correspondence-publish' then
   return jsonb_build_object('published',published);

 elsif p_action='correspondence-summary' then
   return jsonb_build_object(
     'unread',(select count(*) from public.ttc_letters where member_id=member and state='published' and opened_at is null),
     'total',(select count(*) from public.ttc_letters where member_id=member and state='published'));
 elsif p_action='correspondence-list' then
   return jsonb_build_object('letters',coalesce((select jsonb_agg(public.ttc_letter_member_json(x) order by x.published_at desc)
     from public.ttc_letters x where x.member_id=member and x.state='published'),'[]'));
 elsif p_action in ('correspondence-open','correspondence-thank','correspondence-reply') then
   if p_action='correspondence-reply' then
     -- One reply at a time per member, so the limits below cannot be raced.
     perform 1 from public.ttc_members where id=member for update;
     select * into r from public.ttc_letter_replies where member_id=member and idempotency_key=p_input->>'idempotencyKey';
     if r.id is not null then
       if r.letter_id::text<>p_input->>'id' or r.body<>p_input->>'body' then perform public.ttc_fail('idempotency-conflict'); end if;
       return jsonb_build_object('reply',jsonb_build_object('id',r.id,'body',r.body,'createdAt',r.created_at),'duplicate',true);
     end if;
   end if;
   select * into l from public.ttc_letters where id=(p_input->>'id')::uuid and member_id=member and state='published' for update;
   if l.id is null then perform public.ttc_fail('not-found'); end if;
   if l.opened_at is null then
     update public.ttc_letters set opened_at=now(), updated_at=now() where id=l.id returning * into l;
     -- Already reading it: an invitation that has not left yet is no longer needed.
     update public.ttc_messages set state='cancelled', approved_at=null,
       last_error='Not needed: Madam opened the letter before the invitation was sent.'
       where id=l.invitation_message_id and state='approved';
     insert into public.ttc_activity_events(type,detail) values('correspondence.opened',jsonb_build_object('letterId',l.id));
   end if;
   if p_action='correspondence-open' then
     return jsonb_build_object('letter',public.ttc_letter_member_json(l));
   elsif p_action='correspondence-thank' then
     if l.thanked_at is not null then
       return jsonb_build_object('letter',public.ttc_letter_member_json(l),'duplicate',true);
     end if;
     if length(btrim(coalesce(p_input->>'response',''))) = 0 or length(p_input->>'response') > 1600 then perform public.ttc_fail('not-configured'); end if;
     insert into public.ttc_messages(label,body,category,send_at,timezone,state,approved_at,next_attempt_at)
       values(left('Butler’s reply · '||l.title,100),p_input->>'response','correspondence-alise',now(),l.timezone,'approved',now(),now())
       returning id into mid;
     update public.ttc_letters set thanked_at=now(), thanks_message_id=mid, updated_at=now() where id=l.id returning * into l;
     insert into public.ttc_activity_events(type,detail) values('correspondence.thanked',jsonb_build_object('letterId',l.id,'messageId',mid));
     return jsonb_build_object('letter',public.ttc_letter_member_json(l),'duplicate',false);
   else
     if length(btrim(coalesce(p_input->>'body',''))) not between 1 and 1000 then perform public.ttc_fail('invalid'); end if;
     -- The same words to the same letter moments apart are one message.
     select * into r from public.ttc_letter_replies where letter_id=l.id and body=p_input->>'body'
       and created_at > now() - interval '10 minutes' order by created_at desc limit 1;
     if r.id is not null then
       return jsonb_build_object('reply',jsonb_build_object('id',r.id,'body',r.body,'createdAt',r.created_at),'duplicate',true);
     end if;
     select count(*) into recent from public.ttc_letter_replies where member_id=member and created_at > now() - interval '10 minutes';
     if recent >= 5 then perform public.ttc_fail('rate-limited'); end if;
     select count(*) into recent from public.ttc_letter_replies where member_id=member and created_at > now() - interval '24 hours';
     if recent >= 40 then perform public.ttc_fail('rate-limited'); end if;
     note := coalesce(p_input->>'notification','');
     if position('{message}' in note) = 0 then perform public.ttc_fail('not-configured'); end if;
     note := replace(replace(note,'{title}',l.title),'{message}',p_input->>'body');
     insert into public.ttc_messages(label,body,category,send_at,timezone,state,approved_at,next_attempt_at)
       values(left('Message from Alise · '||l.title,100),left(note,1600),'correspondence-arron',now(),'Europe/London','approved',now(),now())
       returning id into mid;
     insert into public.ttc_letter_replies(letter_id,member_id,body,idempotency_key,notification_message_id)
       values(l.id,member,p_input->>'body',p_input->>'idempotencyKey',mid) returning * into r;
     -- Activity records that a message exists, never its words.
     insert into public.ttc_activity_events(type,detail) values('correspondence.message',jsonb_build_object('letterId',l.id,'replyId',r.id,'messageId',mid));
     return jsonb_build_object('reply',jsonb_build_object('id',r.id,'body',r.body,'createdAt',r.created_at),'duplicate',false);
   end if;

 elsif p_action='owner-correspondence-list' then
   return jsonb_build_object('letters',coalesce((select jsonb_agg(public.ttc_letter_owner_json(x)
     order by coalesce(x.published_at,x.deliver_at,x.created_at) desc, x.created_at desc) from public.ttc_letters x),'[]'));
 elsif p_action='owner-correspondence-create' then
   insert into public.ttc_letters(member_id,title,salutation,body,timezone,deliver_at)
     values(member,p_input->>'title',p_input->>'salutation',p_input->>'body',p_input->>'timezone',(p_input->>'deliverAt')::timestamptz)
     returning * into l;
   insert into public.ttc_activity_events(type,detail) values('correspondence.drafted',jsonb_build_object('letterId',l.id));
   return jsonb_build_object('letter',public.ttc_letter_owner_json(l));
 elsif p_action in ('owner-correspondence-update','owner-correspondence-delete','owner-correspondence-schedule',
                    'owner-correspondence-send-now','owner-correspondence-cancel') then
   select * into l from public.ttc_letters where id=(p_input->>'id')::uuid for update;
   if l.id is null then perform public.ttc_fail('not-found'); end if;
   if p_action='owner-correspondence-update' then
     if l.state='published' then perform public.ttc_fail('conflict'); end if;
     deliver := (p_input->>'deliverAt')::timestamptz;
     if l.state='scheduled' and (deliver is null or deliver <= now() or length(btrim(coalesce(p_input->>'body',''))) = 0) then
       perform public.ttc_fail('invalid');
     end if;
     update public.ttc_letters set title=p_input->>'title', salutation=p_input->>'salutation', body=p_input->>'body',
       timezone=p_input->>'timezone', deliver_at=deliver, updated_at=now() where id=l.id returning * into l;
     insert into public.ttc_activity_events(type,detail) values('correspondence.edited',jsonb_build_object('letterId',l.id));
   elsif p_action='owner-correspondence-delete' then
     if l.state<>'draft' then perform public.ttc_fail('conflict'); end if;
     delete from public.ttc_letters where id=l.id;
     insert into public.ttc_activity_events(type,detail) values('correspondence.deleted',jsonb_build_object('letterId',l.id));
     return jsonb_build_object('deleted',l.id);
   elsif p_action='owner-correspondence-schedule' then
     if l.state='published' then perform public.ttc_fail('conflict'); end if;
     if l.state='draft' then
       if l.deliver_at is null or l.deliver_at <= now() or length(btrim(l.body)) = 0 then perform public.ttc_fail('invalid'); end if;
       update public.ttc_letters set state='scheduled', scheduled_at=now(), updated_at=now() where id=l.id returning * into l;
       insert into public.ttc_activity_events(type,detail) values('correspondence.scheduled',jsonb_build_object('letterId',l.id,'deliverAt',l.deliver_at));
     end if;
   elsif p_action='owner-correspondence-cancel' then
     if l.state='published' then perform public.ttc_fail('conflict'); end if;
     if l.state='scheduled' then
       update public.ttc_letters set state='draft', scheduled_at=null, updated_at=now() where id=l.id returning * into l;
       insert into public.ttc_activity_events(type,detail) values('correspondence.unscheduled',jsonb_build_object('letterId',l.id));
     end if;
   else -- send-now
     if l.state<>'published' then
       if length(btrim(l.body)) = 0 then perform public.ttc_fail('invalid'); end if;
       update public.ttc_letters set deliver_at=now() where id=l.id;
       perform public.ttc_letter_publish(l.id, p_input->'templates', 'send-now');
       select * into l from public.ttc_letters where id=l.id;
     end if;
   end if;
   return jsonb_build_object('letter',public.ttc_letter_owner_json(l));
 elsif p_action='owner-correspondence-sms-retry' then
   select * into m from public.ttc_messages where id=(p_input->>'messageId')::uuid for update;
   if m.id is null or m.category not in ('correspondence-alise','correspondence-arron') then perform public.ttc_fail('not-found'); end if;
   -- Only a definite failure or a cancellation may be resent; an uncertain send
   -- may have reached the phone and must be reconciled with Twilio first.
   if m.state not in ('failed','cancelled') then perform public.ttc_fail('conflict'); end if;
   update public.ttc_messages set state='approved', approved_at=now(), send_at=now(), next_attempt_at=now(),
     attempts=0, provider_sid=null, claim_id=null, claimed_at=null, last_error=null where id=m.id returning * into m;
   insert into public.ttc_activity_events(type,detail) values('correspondence.sms-retry',jsonb_build_object('messageId',m.id));
   return jsonb_build_object('sms',public.ttc_letter_sms_json(m.id));
 end if;
 perform public.ttc_fail('not-found'); return null;
end $$;

alter table public.ttc_letters enable row level security;
alter table public.ttc_letter_replies enable row level security;
revoke all on public.ttc_letters, public.ttc_letter_replies from public, anon, authenticated;
grant all on public.ttc_letters, public.ttc_letter_replies to service_role;
create policy service_only on public.ttc_letters for all to service_role using (true) with check (true);
create policy service_only on public.ttc_letter_replies for all to service_role using (true) with check (true);
do $$ declare obj record; begin
 for obj in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and (p.proname like 'ttc_letter%' or p.proname like 'ttc_correspondence%') loop
   execute format('revoke all on function %s from public, anon, authenticated',obj.signature);
   execute format('grant execute on function %s to service_role',obj.signature);
 end loop;
end $$;
