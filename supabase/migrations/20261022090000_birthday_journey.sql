-- The birthday journey (docs/BIRTHDAY_JOURNEY_INTEGRATION_CONTRACT.md,
-- ARCHITECTURE.md ADR-020). Room admissions, the owner's milestones and a
-- durable inbox of cross-system events, with the Butler's correspondence
-- delivered as Correspondence Desk letters (ttc_letters) through the
-- existing publication and SMS outbox.
--
-- Additive only: three new tables, four nullable columns on ttc_letters, a
-- new RPC (ttc_journey_action), and the two letter JSON functions redefined
-- to include the new `action`. No existing row is changed or removed.
--
-- Admission lifecycle per room: no row = LOCKED -> INVITED -> ADMITTED.
-- ADMITTED is permanent. Milestones: pending | held -> fired | failed.

/* ---------- Butler letters with a call to action ---------- */

alter table public.ttc_letters
  add column journey_ref text unique check (journey_ref is null or journey_ref ~ '^[A-Za-z0-9:_.-]{3,160}$'),
  add column action_kind text check (action_kind in ('admission','return')),
  add column action_room text check (action_room in ('lounge','screening-room','casino','gift-vault','privileges')),
  add column action_label text check (action_label is null or length(btrim(action_label)) between 1 and 80);
alter table public.ttc_letters add constraint ttc_letters_action_check
  check ((action_kind is null) = (action_room is null) and (action_kind is null) = (action_label is null));

create or replace function public.ttc_letter_action_json(l public.ttc_letters) returns jsonb
language sql immutable set search_path = '' as $$
 select case when l.action_kind is null then null
   else jsonb_build_object('kind',l.action_kind,'roomId',l.action_room,'label',l.action_label) end
$$;

create or replace function public.ttc_letter_member_json(l public.ttc_letters) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object('id',l.id,'title',l.title,'salutation',l.salutation,'body',l.body,
  'timezone',l.timezone,'deliveredAt',l.published_at,'openedAt',l.opened_at,'thankedAt',l.thanked_at,
  'status',public.ttc_letter_status(l),'action',public.ttc_letter_action_json(l),
  'replies',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'body',r.body,'createdAt',r.created_at) order by r.created_at)
     from public.ttc_letter_replies r where r.letter_id = l.id),'[]'))
$$;

create or replace function public.ttc_letter_owner_json(l public.ttc_letters) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object('id',l.id,'title',l.title,'salutation',l.salutation,'body',l.body,
  'timezone',l.timezone,'deliverAt',l.deliver_at,'state',l.state,'status',public.ttc_letter_status(l),
  'scheduledAt',l.scheduled_at,'publishedAt',l.published_at,'publishedVia',l.published_via,
  'openedAt',l.opened_at,'thankedAt',l.thanked_at,'invitationTemplate',l.invitation_template,
  'invitationSms',public.ttc_letter_sms_json(l.invitation_message_id),
  'thanksSms',public.ttc_letter_sms_json(l.thanks_message_id),
  'journeyRef',l.journey_ref,'action',public.ttc_letter_action_json(l),
  'createdAt',l.created_at,'updatedAt',l.updated_at,
  'replies',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'body',r.body,'createdAt',r.created_at,
       'notificationSms',public.ttc_letter_sms_json(r.notification_message_id)) order by r.created_at desc)
     from public.ttc_letter_replies r where r.letter_id = l.id),'[]'))
$$;

/* ---------- Tables ---------- */

create table public.ttc_room_admissions (
  member_id uuid not null references public.ttc_members(id),
  room_id text not null check (room_id in ('lounge','screening-room','casino','gift-vault','privileges')),
  state text not null check (state in ('invited','admitted')),
  invited_at timestamptz not null default now(),
  invited_via text not null check (invited_via in ('milestone','owner')),
  milestone_key text,
  letter_title text not null check (length(btrim(letter_title)) between 1 and 160),
  letter_body text not null check (length(btrim(letter_body)) between 1 and 4000),
  summons_letter_id uuid references public.ttc_letters(id),
  admitted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (member_id, room_id),
  check ((state = 'admitted') = (admitted_at is not null))
);

create table public.ttc_journey_milestones (
  key text primary key check (key ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  title text not null check (length(btrim(title)) between 1 and 120),
  description text not null default '' check (length(description) <= 1000),
  fire_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending','held','fired','failed')),
  effects jsonb not null default '[]' check (jsonb_typeof(effects) = 'array' and jsonb_array_length(effects) between 1 and 10),
  sort integer not null default 0,
  results jsonb not null default '{"letters":[],"rooms":[]}',
  fired_at timestamptz,
  fired_via text check (fired_via in ('schedule','owner')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((state = 'fired') = (fired_at is not null))
);
create index ttc_journey_milestones_due_idx on public.ttc_journey_milestones(fire_at) where state = 'pending';

create table public.ttc_journey_events (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type ~ '^[a-z][a-z0-9_.]{2,79}$'),
  source text not null check (source ~ '^[a-z0-9-]{2,30}$'),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9:_.-]{8,120}$'),
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  state text not null default 'pending' check (state in ('pending','deferred','processed','recorded','failed')),
  attempts integer not null default 0,
  last_error text,
  letter_id uuid unique references public.ttc_letters(id),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (source, idempotency_key)
);
create index ttc_journey_events_open_idx on public.ttc_journey_events(created_at) where state in ('pending','deferred');

/* ---------- Room state ---------- */

-- For other systems' server actions (e.g. Casino play): is she admitted?
create function public.ttc_room_admitted(p_member uuid, p_room text) returns boolean
language sql stable set search_path = '' as $$
 select exists(select 1 from public.ttc_room_admissions
   where member_id = p_member and room_id = p_room and state = 'admitted')
$$;

create function public.ttc_journey_room_state(p_member uuid, p_room text) returns text
language sql stable set search_path = '' as $$
 select coalesce((select state from public.ttc_room_admissions where member_id = p_member and room_id = p_room),'locked')
$$;

create function public.ttc_admission_member_json(a public.ttc_room_admissions) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object('roomId',a.room_id,'state',a.state,'invitedAt',a.invited_at,'admittedAt',a.admitted_at,
   'letter',case when a.state = 'invited' then jsonb_build_object('title',a.letter_title,'body',a.letter_body) end)
$$;

/* ---------- Events ---------- */

-- The publishing point for every other system (contract §2). Call it in the
-- transaction that commits your own state. Idempotent on (source, key).
create function public.ttc_journey_publish(p_type text, p_source text, p_key text, p_payload jsonb default '{}')
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; e public.ttc_journey_events;
begin
 if p_type is null or p_type !~ '^[a-z][a-z0-9_.]{2,79}$'
    or p_source is null or p_source !~ '^[a-z0-9-]{2,30}$'
    or p_key is null or p_key !~ '^[A-Za-z0-9:_.-]{8,120}$'
    or jsonb_typeof(coalesce(p_payload,'{}')) <> 'object' then
   perform public.ttc_fail('invalid');
 end if;
 insert into public.ttc_journey_events(type,source,idempotency_key,payload)
   values (p_type,p_source,p_key,coalesce(p_payload,'{}'))
   on conflict (source, idempotency_key) do nothing returning id into v_id;
 if v_id is null then
   select * into e from public.ttc_journey_events where source = p_source and idempotency_key = p_key;
   if e.type <> p_type or e.payload <> coalesce(p_payload,'{}') then perform public.ttc_fail('idempotency-conflict'); end if;
   return e.id;
 end if;
 insert into public.ttc_activity_events(type,detail)
   values ('journey.event.received',jsonb_build_object('eventId',v_id,'type',p_type,'source',p_source));
 return v_id;
end $$;

-- The journey's own facts (recorded, never reacted to).
create function public.ttc_journey_note(p_type text, p_key text, p_payload jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
 insert into public.ttc_journey_events(type,source,idempotency_key,payload,state,processed_at)
   values (p_type,'journey',p_key,p_payload,'recorded',now())
   on conflict (source, idempotency_key) do nothing;
end $$;

/* ---------- Butler letters ---------- */

-- Publishes one journey letter, once per reference. Returns its id.
create function public.ttc_journey_letter(p_member uuid, p_ref text, p_title text, p_body text,
  p_action_kind text, p_action_room text, p_tpl jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_label text;
begin
 select id into v_id from public.ttc_letters where journey_ref = p_ref;
 if v_id is not null then return v_id; end if;
 if p_title is null or length(btrim(p_title)) not between 1 and 120
    or p_body is null or length(btrim(p_body)) not between 1 and 4000 then
   perform public.ttc_fail('invalid');
 end if;
 if p_action_kind is not null then
   -- Every summons to the Lounge reads ENTER THE MEMBERS' LOUNGE; a return
   -- names the room itself.
   v_label := case when p_action_kind = 'return' then p_tpl->'returnLabels'->>p_action_room
                   else p_tpl->'enterLabels'->>'lounge' end;
   if v_label is null then perform public.ttc_fail('not-configured'); end if;
 end if;
 insert into public.ttc_letters(member_id,title,salutation,body,timezone,deliver_at,state,scheduled_at,
     journey_ref,action_kind,action_room,action_label)
   values (p_member,left(btrim(p_title),120),'Madam,',btrim(p_body),'America/Jamaica',now(),'scheduled',now(),
     p_ref,p_action_kind,p_action_room,v_label)
   returning id into v_id;
 perform public.ttc_letter_publish(v_id, p_tpl->'invitations', 'send-now');
 return v_id;
end $$;

create function public.ttc_journey_fill(p_text text, p_payload jsonb, p_tpl jsonb) returns text
language sql immutable set search_path = '' as $$
 select replace(replace(replace(coalesce(p_text,''),
   '{quantity}',coalesce(p_payload->>'quantity','')),
   '{title}',coalesce(p_payload->>'title','')),
   '{room}',coalesce(p_tpl->'roomNames'->>(p_payload->>'roomId'),''))
$$;

/* ---------- Admissions ---------- */

-- Invites a room once: the Letter of Admission is stored on the admission;
-- a Butler letter summons her to the Lounge (or, for the Lounge itself,
-- carries the admission). Returns the room's state after the call.
create function public.ttc_journey_invite(p_member uuid, p_room text, p_via text, p_milestone text, p_tpl jsonb)
returns text language plpgsql security invoker set search_path = '' as $$
declare a public.ttc_room_admissions; copy jsonb; v_letter uuid; v_at timestamptz := now();
begin
 if p_room not in ('lounge','screening-room','casino','gift-vault','privileges') then perform public.ttc_fail('invalid'); end if;
 copy := p_tpl->'admissions'->p_room;
 if copy is null or copy->'letter'->>'title' is null or copy->'summons'->>'title' is null then
   perform public.ttc_fail('not-configured');
 end if;
 insert into public.ttc_room_admissions(member_id,room_id,state,invited_at,invited_via,milestone_key,letter_title,letter_body)
   values (p_member,p_room,'invited',v_at,p_via,p_milestone,copy->'letter'->>'title',copy->'letter'->>'body')
   on conflict (member_id, room_id) do nothing returning * into a;
 if a.room_id is null then
   return public.ttc_journey_room_state(p_member,p_room);
 end if;
 v_letter := public.ttc_journey_letter(p_member,
   'admission:'||p_room||':'||floor(extract(epoch from v_at)*1000)::bigint,
   copy->'summons'->>'title', copy->'summons'->>'body', 'admission', p_room, p_tpl);
 update public.ttc_room_admissions set summons_letter_id = v_letter where member_id = p_member and room_id = p_room;
 perform public.ttc_journey_note('room.admission.invited',
   'admission:'||p_room||':invited:'||floor(extract(epoch from v_at)*1000)::bigint,
   jsonb_build_object('roomId',p_room,'via',p_via,'milestone',p_milestone));
 insert into public.ttc_activity_events(type,detail)
   values ('journey.room.invited',jsonb_build_object('roomId',p_room,'via',p_via,'milestone',p_milestone,'letterId',v_letter));
 return 'invited';
end $$;

-- Accepts a Letter of Admission. Idempotent; never twice.
create function public.ttc_journey_accept(p_member uuid, p_room text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare a public.ttc_room_admissions;
begin
 select * into a from public.ttc_room_admissions where member_id = p_member and room_id = p_room for update;
 if a.room_id is null then perform public.ttc_fail('not-open'); end if;
 if a.state = 'admitted' then
   return jsonb_build_object('admission',public.ttc_admission_member_json(a),'duplicate',true);
 end if;
 update public.ttc_room_admissions set state = 'admitted', admitted_at = now(), updated_at = now()
   where member_id = p_member and room_id = p_room returning * into a;
 -- The summons has served its purpose: read, and its SMS no longer needed.
 update public.ttc_letters set opened_at = now(), updated_at = now()
   where id = a.summons_letter_id and opened_at is null;
 update public.ttc_messages set state = 'cancelled', approved_at = null,
     last_error = 'Not needed: Madam accepted her admission before the invitation was sent.'
   where id = (select invitation_message_id from public.ttc_letters where id = a.summons_letter_id) and state = 'approved';
 perform public.ttc_journey_note('room.admission.accepted','admission:'||p_room||':accepted',
   jsonb_build_object('roomId',p_room));
 insert into public.ttc_activity_events(type,detail)
   values ('journey.room.admitted',jsonb_build_object('roomId',p_room));
 return jsonb_build_object('admission',public.ttc_admission_member_json(a),'duplicate',false);
end $$;

/* ---------- Event reactions ---------- */

create function public.ttc_journey_react(p_member uuid, p_event_id uuid, p_tpl jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare e public.ttc_journey_events; v_room text; v_announce boolean; v_copy jsonb; v_letter uuid; q text;
begin
 select * into e from public.ttc_journey_events where id = p_event_id for update;
 if e.state not in ('pending','deferred') then return; end if;
 if e.type = 'casino.spins.issued' then
   q := e.payload->>'quantity';
   if q is null or q !~ '^[1-9][0-9]{0,3}$' then raise exception 'invalid-payload: quantity'; end if;
   v_room := 'casino'; v_announce := coalesce((e.payload->>'announce')::boolean, true);
 elsif e.type = 'casino.prize.awarded' then
   v_room := 'casino'; v_announce := coalesce((e.payload->>'announce')::boolean, false);
 elsif e.type = 'reward.voucher.issued' then
   v_room := e.payload->>'roomId'; v_announce := coalesce((e.payload->>'announce')::boolean, true);
   if v_room is not null and v_room not in ('lounge','screening-room','casino','gift-vault','privileges') then
     raise exception 'invalid-payload: roomId';
   end if;
 elsif e.type = 'reward.voucher.fulfilled' then
   v_room := null; v_announce := coalesce((e.payload->>'announce')::boolean, true);
 else
   update public.ttc_journey_events set state = 'recorded', processed_at = now(), last_error = null where id = e.id;
   return;
 end if;
 if not v_announce then
   update public.ttc_journey_events set state = 'recorded', processed_at = now(), last_error = null where id = e.id;
   return;
 end if;
 -- Never mention a room she has not been admitted to; wait for admission.
 if v_room is not null and not public.ttc_room_admitted(p_member, v_room) then
   if e.state <> 'deferred' then
     update public.ttc_journey_events set state = 'deferred', last_error = null where id = e.id;
   end if;
   return;
 end if;
 v_copy := coalesce(e.payload->'letter', p_tpl->'events'->e.type);
 if v_copy is null or jsonb_typeof(v_copy) <> 'object' then raise exception 'not-configured: no letter for %', e.type; end if;
 v_letter := public.ttc_journey_letter(p_member,'event:'||e.id,
   public.ttc_journey_fill(v_copy->>'title',e.payload,p_tpl),
   public.ttc_journey_fill(v_copy->>'body',e.payload,p_tpl),
   case when v_room is not null then 'return' end, v_room, p_tpl);
 update public.ttc_journey_events set state = 'processed', processed_at = now(), letter_id = v_letter, last_error = null
   where id = e.id;
 insert into public.ttc_activity_events(type,detail)
   values ('journey.event.delivered',jsonb_build_object('eventId',e.id,'type',e.type,'letterId',v_letter));
end $$;

-- Processes open events; one failure never blocks the others.
create function public.ttc_journey_process_events(p_member uuid, p_tpl jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare r record; n integer := 0;
begin
 for r in select id from public.ttc_journey_events where state in ('pending','deferred')
     order by created_at limit 50 for update skip locked loop
   begin
     perform public.ttc_journey_react(p_member, r.id, p_tpl);
     n := n + 1;
   exception when others then
     update public.ttc_journey_events set state = 'failed', attempts = attempts + 1, last_error = left(sqlerrm,300)
       where id = r.id;
     insert into public.ttc_activity_events(type,detail)
       values ('journey.event.failed',jsonb_build_object('eventId',r.id,'error',left(sqlerrm,300)));
   end;
 end loop;
 return n;
end $$;

/* ---------- Milestones ---------- */

-- Fires a milestone exactly once. Every effect runs in one sub-transaction:
-- an error rolls all of them back and leaves the milestone failed, to be
-- retried with the same idempotency keys.
create function public.ttc_journey_fire(p_member uuid, p_key text, p_via text, p_tpl jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare m public.ttc_journey_milestones; eff jsonb; i integer; letters jsonb := '[]'; rooms jsonb := '[]';
  v_letter uuid; v_kind text; v_room text;
begin
 select * into m from public.ttc_journey_milestones where key = p_key for update;
 if m.key is null then perform public.ttc_fail('not-found'); end if;
 if m.state = 'fired' then return jsonb_build_object('key',m.key,'state',m.state,'duplicate',true); end if;
 if p_via = 'schedule' and m.state <> 'pending' then return jsonb_build_object('key',m.key,'state',m.state,'duplicate',true); end if;
 begin
   for i in 0 .. jsonb_array_length(m.effects) - 1 loop
     eff := m.effects->i;
     if eff->>'type' = 'invite-room' then
       perform public.ttc_journey_invite(p_member, eff->>'room', 'milestone', m.key, p_tpl);
       rooms := rooms || to_jsonb(eff->>'room');
       select summons_letter_id into v_letter from public.ttc_room_admissions where member_id = p_member and room_id = eff->>'room';
       if v_letter is not null then letters := letters || to_jsonb(v_letter); end if;
     elsif eff->>'type' = 'letter' then
       v_kind := eff->'action'->>'kind'; v_room := eff->'action'->>'room';
       v_letter := public.ttc_journey_letter(p_member,'milestone:'||m.key||':'||i, eff->>'title', eff->>'body', v_kind, v_room, p_tpl);
       letters := letters || to_jsonb(v_letter);
     elsif eff->>'type' = 'hook' then
       if to_regprocedure('public.ttc_journey_hook(text,jsonb,text)') is null then
         raise exception 'hook-unavailable: % is not installed yet', eff->>'name';
       end if;
       execute 'select public.ttc_journey_hook($1,$2,$3)' using eff->>'name', coalesce(eff->'params','{}'), 'milestone:'||m.key||':'||i;
     else
       raise exception 'invalid-effect: %', coalesce(eff->>'type','none');
     end if;
   end loop;
   update public.ttc_journey_milestones set state = 'fired', fired_at = now(), fired_via = p_via,
     attempts = attempts + 1, last_error = null, results = jsonb_build_object('letters',letters,'rooms',rooms),
     updated_at = now() where key = m.key returning * into m;
   insert into public.ttc_activity_events(type,detail)
     values ('journey.milestone.fired',jsonb_build_object('key',m.key,'via',p_via));
 exception when others then
   update public.ttc_journey_milestones set state = 'failed', attempts = attempts + 1, last_error = left(sqlerrm,300),
     updated_at = now() where key = p_key returning * into m;
   insert into public.ttc_activity_events(type,detail)
     values ('journey.milestone.failed',jsonb_build_object('key',p_key,'via',p_via,'error',left(sqlerrm,300)));
 end;
 return jsonb_build_object('key',m.key,'state',m.state,'duplicate',false);
end $$;

create function public.ttc_journey_fire_due(p_member uuid, p_tpl jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare r record; n integer := 0;
begin
 for r in select key from public.ttc_journey_milestones where state = 'pending' and fire_at <= now()
     order by fire_at, sort, key limit 20 for update skip locked loop
   perform public.ttc_journey_fire(p_member, r.key, 'schedule', p_tpl);
   n := n + 1;
 end loop;
 return n;
end $$;

create function public.ttc_journey_milestone_json(m public.ttc_journey_milestones, p_member uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
declare letters jsonb; rooms jsonb; progress text; all_admitted boolean; any_opened boolean; all_opened boolean;
begin
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'title',l.title,'publishedAt',l.published_at,'openedAt',l.opened_at)),'[]'),
        bool_or(l.opened_at is not null), coalesce(bool_and(l.opened_at is not null), false)
   into letters, any_opened, all_opened
   from public.ttc_letters l where l.id in (select (value #>> '{}')::uuid from jsonb_array_elements(m.results->'letters'));
 select coalesce(jsonb_agg(jsonb_build_object('roomId',r.value #>> '{}','state',public.ttc_journey_room_state(p_member,r.value #>> '{}'))),'[]'),
        coalesce(bool_and(public.ttc_room_admitted(p_member,r.value #>> '{}')), false)
   into rooms, all_admitted
   from jsonb_array_elements(m.results->'rooms') r;
 progress := case
   when m.state <> 'fired' then m.state
   when jsonb_array_length(rooms) > 0 and all_admitted then 'completed'
   when jsonb_array_length(rooms) = 0 and jsonb_array_length(letters) > 0 and all_opened then 'completed'
   when jsonb_array_length(rooms) = 0 and jsonb_array_length(letters) = 0 then 'completed'
   when any_opened then 'opened'
   when jsonb_array_length(letters) > 0 then 'delivered'
   else 'triggered' end;
 return jsonb_build_object('key',m.key,'title',m.title,'description',m.description,'fireAt',m.fire_at,
   'state',m.state,'progress',progress,'effects',m.effects,'firedAt',m.fired_at,'firedVia',m.fired_via,
   'attempts',m.attempts,'lastError',m.last_error,'letters',letters,'rooms',rooms,'updatedAt',m.updated_at);
end $$;

-- Validates an owner's milestone effects (the server never trusts the form).
create function public.ttc_journey_effects_valid(p_effects jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare eff jsonb; rooms text[] := array['lounge','screening-room','casino','gift-vault','privileges'];
begin
 if jsonb_typeof(p_effects) <> 'array' or jsonb_array_length(p_effects) not between 1 and 10 then return false; end if;
 for eff in select value from jsonb_array_elements(p_effects) loop
   if jsonb_typeof(eff) <> 'object' then return false; end if;
   if eff->>'type' = 'invite-room' then
     if not (eff->>'room' = any(rooms)) then return false; end if;
   elsif eff->>'type' = 'letter' then
     if length(btrim(coalesce(eff->>'title',''))) not between 1 and 120 or length(btrim(coalesce(eff->>'body',''))) not between 1 and 4000 then return false; end if;
     if eff->'action' is not null and jsonb_typeof(eff->'action') <> 'null' then
       if not (eff->'action'->>'kind' in ('admission','return')) or not (eff->'action'->>'room' = any(rooms)) then return false; end if;
     end if;
   elsif eff->>'type' = 'hook' then
     if coalesce(eff->>'name','') !~ '^[a-z][a-z0-9_.-]{2,60}$' then return false; end if;
     if eff->'params' is not null and jsonb_typeof(eff->'params') <> 'object' then return false; end if;
   else
     return false;
   end if;
 end loop;
 return true;
end $$;

/* ---------- The RPC ---------- */

create function public.ttc_journey_action(p_actor uuid, p_role text, p_action text, p_input jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 member uuid; tpl jsonb; fired integer; processed integer; m public.ttc_journey_milestones;
 v_room text; v_state text; v_event uuid; e public.ttc_journey_events; a public.ttc_room_admissions; result jsonb;
begin
 select id into member from public.ttc_members where slug = 'alise' and enabled;
 if member is null then perform public.ttc_fail('not-configured'); end if;
 if p_role not in ('system','owner','member') or p_role is null then perform public.ttc_fail('forbidden'); end if;
 if p_role = 'member' and (p_actor is distinct from member) then perform public.ttc_fail('forbidden'); end if;
 if p_action like 'owner-%' and p_role <> 'owner' then perform public.ttc_fail('forbidden'); end if;
 if p_action like 'system-%' and p_role <> 'system' then perform public.ttc_fail('forbidden'); end if;
 if p_action like 'journey-%' and p_role <> 'member' then perform public.ttc_fail('forbidden'); end if;
 if jsonb_typeof(p_input->'journey') is distinct from 'object' or jsonb_typeof(p_input->'templates') is distinct from 'object' then
   perform public.ttc_fail('not-configured');
 end if;
 tpl := (p_input->'journey') || jsonb_build_object('invitations', p_input->'templates');

 if p_action = 'system-journey-event' then
   v_event := public.ttc_journey_publish(p_input->>'type', p_input->>'source', p_input->>'key', coalesce(p_input->'payload','{}'));
 end if;

 -- The safety net: whatever the call, due milestones fire and open events
 -- are processed (the every-minute round does the same).
 fired := public.ttc_journey_fire_due(member, tpl);
 processed := public.ttc_journey_process_events(member, tpl);

 if p_action = 'system-journey-round' then
   return jsonb_build_object('fired',fired,'processed',processed);
 elsif p_action = 'system-journey-event' then
   select * into e from public.ttc_journey_events where id = v_event;
   return jsonb_build_object('event',jsonb_build_object('id',e.id,'state',e.state,'letterId',e.letter_id));

 elsif p_action = 'journey-state' then
   return jsonb_build_object('now',now(),'admissions',coalesce((select jsonb_agg(public.ttc_admission_member_json(x) order by x.invited_at)
     from public.ttc_room_admissions x where x.member_id = member),'[]'));
 elsif p_action = 'journey-accept' then
   v_room := p_input->>'roomId';
   result := public.ttc_journey_accept(member, v_room);
   -- Anything waiting for this room (e.g. spins credited earlier) follows.
   perform public.ttc_journey_process_events(member, tpl);
   return result;

 elsif p_action = 'owner-journey' then
   return jsonb_build_object(
     'now',now(),
     'milestones',coalesce((select jsonb_agg(public.ttc_journey_milestone_json(x, member) order by x.fire_at, x.sort, x.key)
        from public.ttc_journey_milestones x),'[]'),
     'admissions',(select jsonb_agg(jsonb_build_object('roomId',r.room,
        'state',coalesce(a2.state,'locked'),'invitedAt',a2.invited_at,'invitedVia',a2.invited_via,
        'milestoneKey',a2.milestone_key,'admittedAt',a2.admitted_at,
        'summons',case when l.id is null then null else jsonb_build_object('id',l.id,'publishedAt',l.published_at,
           'openedAt',l.opened_at,'smsState',(select state from public.ttc_messages where id = l.invitation_message_id)) end)
        order by r.n)
        from unnest(array['lounge','casino','screening-room','gift-vault','privileges']) with ordinality as r(room,n)
        left join public.ttc_room_admissions a2 on a2.member_id = member and a2.room_id = r.room
        left join public.ttc_letters l on l.id = a2.summons_letter_id),
     'events',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'type',x.type,'source',x.source,
        'idempotencyKey',x.idempotency_key,'payload',x.payload,'state',x.state,'attempts',x.attempts,
        'lastError',x.last_error,'letterId',x.letter_id,'createdAt',x.created_at,'processedAt',x.processed_at)
        order by x.created_at desc) from (select * from public.ttc_journey_events order by created_at desc limit 100) x),'[]'),
     'letters',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'journeyRef',x.journey_ref,
        'action',public.ttc_letter_action_json(x),'publishedAt',x.published_at,'openedAt',x.opened_at,
        'sms',(select jsonb_build_object('id',s.id,'state',s.state,'lastError',s.last_error) from public.ttc_messages s where s.id = x.invitation_message_id))
        order by x.published_at desc nulls last) from (select * from public.ttc_letters where journey_ref is not null order by published_at desc nulls last limit 100) x),'[]'),
     'activity',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'type',x.type,'detail',x.detail,'createdAt',x.created_at)
        order by x.created_at desc) from (select * from public.ttc_activity_events where type like 'journey.%' order by created_at desc limit 100) x),'[]'));

 elsif p_action = 'owner-journey-milestone-create' then
   if not public.ttc_journey_effects_valid(p_input->'effects') then perform public.ttc_fail('invalid'); end if;
   insert into public.ttc_journey_milestones(key,title,description,fire_at,state,effects,sort)
     values (p_input->>'key',btrim(p_input->>'title'),coalesce(p_input->>'description',''),(p_input->>'fireAt')::timestamptz,
       'held',p_input->'effects',100)
     returning * into m;
   insert into public.ttc_activity_events(type,detail) values ('journey.milestone.created',jsonb_build_object('key',m.key));
   return jsonb_build_object('milestone',public.ttc_journey_milestone_json(m, member));
 elsif p_action like 'owner-journey-milestone-%' then
   select * into m from public.ttc_journey_milestones where key = p_input->>'key' for update;
   if m.key is null then perform public.ttc_fail('not-found'); end if;
   if p_action = 'owner-journey-milestone-update' then
     if m.state = 'fired' then perform public.ttc_fail('conflict'); end if;
     if p_input ? 'effects' and not public.ttc_journey_effects_valid(p_input->'effects') then perform public.ttc_fail('invalid'); end if;
     update public.ttc_journey_milestones set
       title = coalesce(btrim(p_input->>'title'), title),
       description = coalesce(p_input->>'description', description),
       fire_at = coalesce((p_input->>'fireAt')::timestamptz, fire_at),
       effects = coalesce(p_input->'effects', effects),
       updated_at = now()
     where key = m.key returning * into m;
     insert into public.ttc_activity_events(type,detail)
       values ('journey.milestone.edited',jsonb_build_object('key',m.key,'fireAt',m.fire_at));
   elsif p_action = 'owner-journey-milestone-hold' then
     if m.state = 'fired' then perform public.ttc_fail('conflict'); end if;
     if m.state <> 'held' then
       update public.ttc_journey_milestones set state = 'held', updated_at = now() where key = m.key returning * into m;
       insert into public.ttc_activity_events(type,detail) values ('journey.milestone.held',jsonb_build_object('key',m.key));
     end if;
   elsif p_action = 'owner-journey-milestone-resume' then
     if m.state = 'fired' then perform public.ttc_fail('conflict'); end if;
     if m.state = 'held' then
       update public.ttc_journey_milestones set state = 'pending', updated_at = now() where key = m.key returning * into m;
       insert into public.ttc_activity_events(type,detail) values ('journey.milestone.resumed',jsonb_build_object('key',m.key));
       -- Already due: it fires now, in this call, rather than by surprise later.
       perform public.ttc_journey_fire_due(member, tpl);
       select * into m from public.ttc_journey_milestones where key = m.key;
     end if;
   elsif p_action in ('owner-journey-milestone-fire','owner-journey-milestone-retry') then
     if p_action = 'owner-journey-milestone-retry' and m.state <> 'failed' then perform public.ttc_fail('conflict'); end if;
     if m.state <> 'fired' then
       perform public.ttc_journey_fire(member, m.key, 'owner', tpl);
       perform public.ttc_journey_process_events(member, tpl);
       select * into m from public.ttc_journey_milestones where key = m.key;
     end if;
   else
     perform public.ttc_fail('not-found');
   end if;
   return jsonb_build_object('milestone',public.ttc_journey_milestone_json(m, member));

 elsif p_action = 'owner-journey-room-invite' then
   v_room := p_input->>'roomId';
   v_state := public.ttc_journey_invite(member, v_room, 'owner', null, tpl);
   return jsonb_build_object('roomId',v_room,'state',v_state);
 elsif p_action = 'owner-journey-room-withdraw' then
   v_room := p_input->>'roomId';
   select * into a from public.ttc_room_admissions where member_id = member and room_id = v_room for update;
   if a.room_id is null then return jsonb_build_object('roomId',v_room,'state','locked'); end if;
   -- An admission she has accepted is hers: it can never be taken back.
   if a.state = 'admitted' then perform public.ttc_fail('conflict'); end if;
   delete from public.ttc_room_admissions where member_id = member and room_id = v_room;
   update public.ttc_messages set state = 'cancelled', approved_at = null,
       last_error = 'Not needed: the owner withdrew the invitation before it was sent.'
     where id = (select invitation_message_id from public.ttc_letters where id = a.summons_letter_id) and state = 'approved';
   insert into public.ttc_activity_events(type,detail)
     values ('journey.room.withdrawn',jsonb_build_object('roomId',v_room,'letterId',a.summons_letter_id));
   return jsonb_build_object('roomId',v_room,'state','locked');
 elsif p_action = 'owner-journey-event-retry' then
   select * into e from public.ttc_journey_events where id = (p_input->>'id')::uuid for update;
   if e.id is null then perform public.ttc_fail('not-found'); end if;
   if e.state <> 'failed' then perform public.ttc_fail('conflict'); end if;
   update public.ttc_journey_events set state = 'pending', last_error = null where id = e.id;
   insert into public.ttc_activity_events(type,detail) values ('journey.event.retried',jsonb_build_object('eventId',e.id));
   perform public.ttc_journey_process_events(member, tpl);
   select * into e from public.ttc_journey_events where id = e.id;
   return jsonb_build_object('event',jsonb_build_object('id',e.id,'state',e.state,'letterId',e.letter_id,'lastError',e.last_error));
 end if;
 perform public.ttc_fail('not-found'); return null;
end $$;

/* ---------- Default milestones (never overwrite the owner's) ---------- */
-- Times are Jamaica wall-clock (UTC-5, no daylight saving), stored in UTC.
-- Room openings are armed; milestones whose wording or timing still needs
-- the owner (and the Casino spins hook, until Codex deploys it) are held.

insert into public.ttc_journey_milestones(key,title,description,fire_at,state,effects,sort) values
 ('early-membership','Early membership — the Members’ Lounge',
  'Founding membership: the Lounge opens to Alise before the birthday. She accepts from the Butler’s letter.',
  '2026-10-20 13:00:00-05','pending','[{"type":"invite-room","room":"lounge"}]',10),
 ('departure-ugg','Departure — the UGG presentation',
  'Before leaving for the airport. Wording and time to confirm, then resume.',
  '2026-10-22 03:00:00-05','held',
  '[{"type":"letter","title":"Before you leave","body":"A small matter before your departure. Something has been set aside for the journey. I am told it is warm, and that you will know exactly what to do with it."}]',20),
 ('departure-privileges','Departure — airport privileges',
  'Duty Free, a drink and food at the airport. The Departure Lounge opens and redeems these itself; this is only the Butler’s note. Confirm, then resume.',
  '2026-10-22 08:00:00-05','held',
  '[{"type":"letter","title":"Your airport privileges","body":"Your airport privileges are prepared: a little Duty Free, a drink, and something to eat. You will find them in the Departure Lounge."}]',30),
 ('departure-airpods','Departure — the hidden tag',
  'A hint towards the AirPods surprise behind a hidden NFC tag. Wording to confirm, then resume.',
  '2026-10-22 09:00:00-05','held',
  '[{"type":"letter","title":"Listen carefully","body":"A small instruction: something is hidden close at hand. When you find it, hold your telephone to it. I believe you will hear about it shortly."}]',40),
 ('casino-opening','The Grand Casino opens',
  'Casino admission letter in the Lounge; the Casino appears in the Directory once accepted.',
  '2026-10-23 09:00:00-05','pending','[{"type":"invite-room","room":"casino"}]',50),
 ('casino-opening-spins','Complimentary spins at the opening',
  'Issued by the Casino system through its journey hook. Held until that hook is deployed; then resume.',
  '2026-10-23 09:00:00-05','held','[{"type":"hook","name":"casino.spins.issue","params":{"quantity":5,"announce":false}}]',51),
 ('casino-evening-mystery','An evening mystery at the Casino',
  'Optional. Wording and reward to confirm with the Casino system, then resume.',
  '2026-10-23 20:00:00-05','held',
  '[{"type":"letter","title":"The croupier has a confession","body":"The croupier tells me something unusual has been placed upon the tables this evening. He would not tell me what. I suggest you find out.","action":{"kind":"return","room":"casino"}}]',60),
 ('birthday-screening','Birthday — the Private Screening Room',
  'At midnight in Jamaica: the Screening Room admission letter, presented in the Lounge after the doors.',
  '2026-10-24 00:00:00-05','pending','[{"type":"invite-room","room":"screening-room"}]',70),
 ('birthday-vault','Birthday — the Gift Vault',
  'At midnight in Jamaica: the Gift Vault admission letter. Compartments keep their own server-side availability.',
  '2026-10-24 00:00:00-05','pending','[{"type":"invite-room","room":"gift-vault"}]',71),
 ('birthday-breakfast','Birthday — breakfast in bed',
  '10:30 in Jamaica. Wording to confirm, then resume.',
  '2026-10-24 10:30:00-05','held',
  '[{"type":"letter","title":"Breakfast is served","body":"Good morning, and many happy returns. Breakfast is on its way to you. Please do not get up; that is rather the point."}]',80)
on conflict (key) do nothing;

/* ---------- Security ---------- */

alter table public.ttc_room_admissions enable row level security;
alter table public.ttc_journey_milestones enable row level security;
alter table public.ttc_journey_events enable row level security;
revoke all on public.ttc_room_admissions, public.ttc_journey_milestones, public.ttc_journey_events from public, anon, authenticated;
grant all on public.ttc_room_admissions, public.ttc_journey_milestones, public.ttc_journey_events to service_role;
create policy service_only on public.ttc_room_admissions for all to service_role using (true) with check (true);
create policy service_only on public.ttc_journey_milestones for all to service_role using (true) with check (true);
create policy service_only on public.ttc_journey_events for all to service_role using (true) with check (true);
do $$ declare obj record; begin
 for obj in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and (p.proname like 'ttc_journey%' or p.proname like 'ttc_room_%'
     or p.proname in ('ttc_admission_member_json','ttc_letter_action_json','ttc_letter_member_json','ttc_letter_owner_json')) loop
   execute format('revoke all on function %s from public, anon, authenticated', obj.signature);
   execute format('grant execute on function %s to service_role', obj.signature);
 end loop;
end $$;
