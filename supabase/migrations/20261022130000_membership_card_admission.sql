-- The membership card admission and Casino promise consistency (ADR-023).
-- Requires, in order: 20261022090000_birthday_journey, 20261022100000_casino_rewards,
-- 20261022110000_communication_hold, 20261022120000_sms_operations.
--
-- Additive only. Existing functions are wrapped (originals renamed, as the
-- communication hold did), so the four audited migrations are unchanged.
--
-- 1. The physical membership card (its existing /c/<token> link, verified by
--    the concierge service) is recorded here when presented; early admission
--    to the Lounge before the birthday requires it (`card-required`).
-- 2. The 19:00 UK early admission carries the Butler's letter (owner-editable
--    clue). Once fired, the public entrance shows that letter; its SMS links
--    to the entrance. A letter still holding a [[placeholder]] never publishes.
-- 3. A delivered promise of spins sets a floor (played + available at that
--    moment); a batch cancellation that would leave fewer is refused
--    (`spins-promised`). Codex P1 f7eff13 and its 282c4ea counterexample.

/* ---------- The membership card ---------- */

create table public.ttc_membership_card (
  member_id uuid primary key references public.ttc_members(id),
  first_presented_at timestamptz not null default now(),
  last_presented_at timestamptz not null default now(),
  presentations integer not null default 1 check (presentations >= 1)
);

/* ---------- Placeholders never reach her ---------- */

alter function public.ttc_journey_letter(uuid, text, text, text, text, text, jsonb)
  rename to ttc_journey_letter_unchecked;
create function public.ttc_journey_letter(p_member uuid, p_ref text, p_title text, p_body text,
  p_action_kind text, p_action_room text, p_tpl jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
begin
 -- Inside a milestone this fails the milestone (visible to the owner, retryable
 -- after editing); nothing is published.
 if not exists (select 1 from public.ttc_letters where journey_ref = p_ref)
    and (position('[[' in coalesce(p_title,'')) > 0 or position('[[' in coalesce(p_body,'')) > 0) then
   raise exception 'placeholder: replace the [[…]] wording before this letter can be sent';
 end if;
 return public.ttc_journey_letter_unchecked(p_member, p_ref, p_title, p_body, p_action_kind, p_action_room, p_tpl);
end $$;

/* ---------- The Casino's promise ---------- */

-- A promise of spins is a quantity, not a flag. When a promise reaches her
-- (the Casino's Letter of Admission mentions spins, or a "spins credited"
-- letter is delivered) the floor becomes everything she could then play:
-- spins already played + spins still available. Playing never changes that
-- sum; issuing raises it; only a cancellation can lower it, and a
-- cancellation that would take it below the floor is refused. So a
-- delivered "three spins" can never be swapped for one (Codex, 282c4ea),
-- partial replacements and partly spent balances are covered, and two
-- cancellations racing each other are serialised by the member row lock.
create table public.ttc_casino_promise_floor (
  member_id uuid primary key references public.ttc_members(id),
  floor integer not null default 0 check (floor >= 0),
  updated_at timestamptz not null default now()
);

-- Everything she could play right now: played + available.
create function public.ttc_casino_spin_total(p_member uuid) returns integer
language sql stable set search_path = '' as $$
 select (select count(*) from public.ttc_casino_spins where member_id = p_member)::integer
      + coalesce((select sum(quantity - next_position + 1) from public.ttc_casino_batches
                  where member_id = p_member and status = 'active'), 0)::integer
$$;

create function public.ttc_casino_raise_promise(p_member uuid, p_reason text) returns integer
language plpgsql security invoker set search_path = '' as $$
declare v integer;
begin
 perform 1 from public.ttc_members where id = p_member for update;
 v := public.ttc_casino_spin_total(p_member);
 insert into public.ttc_casino_promise_floor(member_id, floor) values (p_member, v)
   on conflict (member_id) do update set floor = greatest(public.ttc_casino_promise_floor.floor, excluded.floor),
     updated_at = now()
   returning floor into v;
 insert into public.ttc_activity_events(type,detail)
   values ('casino.promise.recorded', jsonb_build_object('reason', p_reason, 'floor', v));
 return v;
end $$;

-- A "spins credited" letter delivered (its event processed with a letter).
create function public.ttc_casino_promise_on_letter() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_member uuid;
begin
 select id into v_member from public.ttc_members where slug = 'alise' and enabled;
 if v_member is not null then
   perform public.ttc_casino_raise_promise(v_member, 'spins-letter:' || new.idempotency_key);
 end if;
 return new;
end $$;
create trigger ttc_casino_promise_on_letter
  after update of state, letter_id on public.ttc_journey_events
  for each row
  when (new.type = 'casino.spins.issued' and new.state = 'processed' and new.letter_id is not null
        and (old.state is distinct from 'processed' or old.letter_id is null))
  execute function public.ttc_casino_promise_on_letter();

alter table public.ttc_room_admissions add column promises_spins boolean not null default false;

alter function public.ttc_journey_invite(uuid, text, text, text, jsonb) rename to ttc_journey_invite_unflagged;
create function public.ttc_journey_invite(p_member uuid, p_room text, p_via text, p_milestone text, p_tpl jsonb)
returns text language plpgsql security invoker set search_path = '' as $$
declare v_existed boolean; v_state text; a public.ttc_room_admissions; v_promises boolean;
begin
 if p_room <> 'casino' then
   return public.ttc_journey_invite_unflagged(p_member, p_room, p_via, p_milestone, p_tpl);
 end if;
 -- The member row orders this against a concurrent batch cancellation, so the
 -- letter's choice and the batches it describes are read consistently.
 perform 1 from public.ttc_members where id = p_member for update;
 v_existed := exists(select 1 from public.ttc_room_admissions where member_id = p_member and room_id = 'casino');
 v_state := public.ttc_journey_invite_unflagged(p_member, p_room, p_via, p_milestone, p_tpl);
 if not v_existed then
   select * into a from public.ttc_room_admissions where member_id = p_member and room_id = 'casino';
   if a.room_id is not null then
     v_promises := a.letter_body is distinct from p_tpl->'admissions'->'casino'->'letterWithoutSpins'->>'body';
     update public.ttc_room_admissions set promises_spins = v_promises
       where member_id = p_member and room_id = 'casino';
     if v_promises then perform public.ttc_casino_raise_promise(p_member, 'casino-admission'); end if;
   end if;
 end if;
 return v_state;
end $$;

alter function public.ttc_casino_action(uuid, text, text, jsonb) rename to ttc_casino_action_core;
create function public.ttc_casino_action(p_actor uuid, p_role text, p_action text, p_input jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare b public.ttc_casino_batches; v_delivered boolean; v_floor integer; v_after integer;
begin
 if p_action <> 'owner-casino-cancel' then
   return public.ttc_casino_action_core(p_actor, p_role, p_action, p_input);
 end if;
 if p_role is distinct from 'owner' then perform public.ttc_fail('forbidden'); end if;
 select * into b from public.ttc_casino_batches where id = (p_input->>'id')::uuid;
 if b.id is null then perform public.ttc_fail('not-found'); end if;
 -- Same lock order as play, issuing and the Casino invitation: member, then batch.
 perform 1 from public.ttc_members where id = b.member_id for update;
 select * into b from public.ttc_casino_batches where id = b.id for update;
 v_delivered := exists(select 1 from public.ttc_journey_events
   where source = 'casino' and idempotency_key = 'spins-batch-'||b.id and state = 'processed');
 -- A retried cancellation returns the same answer.
 if b.status = 'cancelled' then
   return jsonb_build_object('batchId',b.id,'status','cancelled','duplicate',true,'announcementDelivered',v_delivered);
 end if;
 if b.status <> 'active' or b.next_position <> 1 then perform public.ttc_fail('conflict'); end if;
 v_floor := coalesce((select floor from public.ttc_casino_promise_floor where member_id = b.member_id), 0);
 v_after := public.ttc_casino_spin_total(b.member_id) - (b.quantity - b.next_position + 1);
 if v_after < v_floor then
   insert into public.ttc_activity_events(type,detail) values('casino.batch.cancel-refused',
     jsonb_build_object('batchId',b.id,'promised',v_floor,'wouldRemain',v_after));
   perform public.ttc_fail('spins-promised');
 end if;
 update public.ttc_casino_batches set status = 'cancelled', completed_at = now() where id = b.id;
 update public.ttc_journey_events set state = 'recorded', processed_at = now(),
     last_error = 'Batch cancelled before the announcement was delivered.'
   where source = 'casino' and idempotency_key = 'spins-batch-'||b.id and state in ('pending','deferred','failed');
 insert into public.ttc_activity_events(type,detail) values('casino.batch.cancelled',jsonb_build_object('batchId',b.id));
 return jsonb_build_object('batchId',b.id,'status','cancelled','duplicate',false,'announcementDelivered',v_delivered);
end $$;

/* ---------- Journey: the card, the entrance letter, the enter guard ---------- */

alter function public.ttc_journey_action(uuid, text, text, jsonb) rename to ttc_journey_action_uncarded;
create function public.ttc_journey_action(p_actor uuid, p_role text, p_action text, p_input jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare member uuid; c public.ttc_membership_card; m public.ttc_journey_milestones; result jsonb; v_letter jsonb;
  expires timestamptz; v_first boolean;
begin
 if p_action = 'system-journey-card' then
   -- The server has verified a live-realm session that carries the membership
   -- credential (the card's link or its printed code). Records the card and,
   -- when asked, opens a member session for this device. Never an owner.
   if p_role is distinct from 'system' then perform public.ttc_fail('forbidden'); end if;
   select id into member from public.ttc_members where slug = 'alise' and enabled;
   if member is null then perform public.ttc_fail('not-configured'); end if;
   perform 1 from public.ttc_members where id = member for update;
   v_first := not exists(select 1 from public.ttc_membership_card where member_id = member);
   insert into public.ttc_membership_card(member_id) values (member)
     on conflict (member_id) do update set last_presented_at = now(),
       presentations = public.ttc_membership_card.presentations + 1
     returning * into c;
   if v_first then
     insert into public.ttc_activity_events(type,detail) values ('journey.card.presented',
       jsonb_build_object('at',c.first_presented_at));
   end if;
   result := jsonb_build_object('card',jsonb_build_object('firstPresentedAt',c.first_presented_at,
     'presentations',c.presentations));
   if p_input ? 'hash' then
     expires := now() + interval '30 days';
     insert into public.ttc_sessions(token_hash,role,member_id,expires_at) values (p_input->>'hash','member',member,expires);
     insert into public.ttc_activity_events(type) values ('membership.bridged');
     result := result || jsonb_build_object('session',jsonb_build_object('role','member','memberId',member,'expiresAt',expires));
   end if;
   return result;
 end if;

 if p_action = 'journey-enter' and p_role = 'member' then
   -- There is one entrance: 21 Oct 19:00 UK, with the card. The fired
   -- early admission and the card are both required, on the birthday too;
   -- no date alone ever admits her.
   select id into member from public.ttc_members where slug = 'alise' and enabled;
   if member is not null and p_actor = member then
     select * into m from public.ttc_journey_milestones where key = 'early-membership';
     if coalesce(m.state, '') <> 'fired' then perform public.ttc_fail('not-open'); end if;
     if not exists(select 1 from public.ttc_membership_card where member_id = member) then
       perform public.ttc_fail('card-required');
     end if;
   end if;
 end if;

 result := public.ttc_journey_action_uncarded(p_actor, p_role, p_action, p_input);

 if p_action = 'system-journey-entrance' and (result->>'eligible')::boolean then
   -- Once 19:00 has fired, the Butler's letter waits at the doors for whoever
   -- holds the card (the clue to where it is). Not before.
   select * into m from public.ttc_journey_milestones where key = 'early-membership';
   select e into v_letter from jsonb_array_elements(m.effects) e where e->>'type' = 'letter' limit 1;
   if v_letter is not null then
     result := result || jsonb_build_object('letter',
       jsonb_build_object('title',v_letter->>'title','body',v_letter->>'body'));
   end if;
 end if;
 return result;
end $$;

/* ---------- The 19:00 letter (owner-editable until it fires) ---------- */

update public.ttc_journey_milestones
   set effects = effects || jsonb_build_array(jsonb_build_object(
         'type','letter',
         'title','Your early admission',
         'body','I am pleased to confirm that the committee has agreed to receive you this evening, rather sooner than the calendar intended. Your membership card has been delivered. I took the liberty of placing it somewhere I felt you would appreciate: [[CLUE — write the hiding place in the Owner Control Centre before 19:00]]. When you find it, hold your telephone to it. The doors will know.',
         'action',jsonb_build_object('kind','admission','room','lounge'))),
       description = 'The entrance counts down to this time once you resume it (and communications are released). At 19:00 UK / 13:00 Jamaica the Butler''s letter (with your clue) is published, its SMS links to the entrance, and the clock holds at 00:00:10 until she presents her membership card. Write the clue (replace [[…]]) before it fires, or the milestone fails and nothing is sent. Held until you approve.',
       updated_at = now()
 where key = 'early-membership' and state <> 'fired'
   and not exists (select 1 from jsonb_array_elements(effects) e where e->>'type' = 'letter');

/* ---------- Named time zones for milestones ---------- */

-- Every milestone fires at a server instant (timestamptz). Its named IANA
-- zone says how the owner reads and edits it: 21-22 October in the UK
-- (Europe/London, which leaves BST on 25 October), 23-26 October in
-- Jamaica (America/Jamaica, no daylight saving). Instants already stored
-- are unchanged.
alter table public.ttc_journey_milestones add column timezone text not null default 'America/Jamaica'
  check (timezone in ('Europe/London','America/Jamaica'));
update public.ttc_journey_milestones set timezone = 'Europe/London'
 where key in ('early-membership','departure-ugg','departure-privileges','departure-airpods');

alter function public.ttc_journey_milestone_json(public.ttc_journey_milestones, uuid)
  rename to ttc_journey_milestone_json_zoneless;
create function public.ttc_journey_milestone_json(m public.ttc_journey_milestones, p_member uuid) returns jsonb
language sql stable set search_path = '' as $$
 select public.ttc_journey_milestone_json_zoneless(m, p_member) || jsonb_build_object('timezone', m.timezone)
$$;

-- Held, with wording to write (never sent while [[…]] remains). Arrival in
-- Jamaica is triggered by the owner when she lands; dinner at 16:00 Jamaica.
insert into public.ttc_journey_milestones(key,title,description,fire_at,state,effects,sort,timezone) values
 ('jamaica-arrival','Arrival in Jamaica (trigger when she lands)',
  'No fixed time: press Trigger now once the flight has landed. Write the wording first.',
  '2026-10-22 18:00:00-05','held',
  '[{"type":"letter","title":"Welcome to Jamaica","body":"[[ARRIVAL — write the Butler''s welcome before triggering]]"}]',45,'America/Jamaica'),
 ('birthday-dinner','Birthday — the dinner announcement (16:00 Jamaica)',
  'Sat 24 Oct, 16:00 Jamaica. Write the wording (reservation and escort times) once confirmed, then resume.',
  '2026-10-24 16:00:00-05','held',
  '[{"type":"letter","title":"This evening","body":"[[DINNER — confirm the reservation, then write the announcement]]"}]',85,'America/Jamaica')
on conflict (key) do nothing;

/* ---------- Security ---------- */

alter table public.ttc_membership_card enable row level security;
alter table public.ttc_casino_promise_floor enable row level security;
revoke all on public.ttc_membership_card, public.ttc_casino_promise_floor from public, anon, authenticated;
grant all on public.ttc_membership_card, public.ttc_casino_promise_floor to service_role;
create policy service_only on public.ttc_membership_card for all to service_role using (true) with check (true);
create policy service_only on public.ttc_casino_promise_floor for all to service_role using (true) with check (true);
do $$ declare obj record; begin
 for obj in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('ttc_journey_letter','ttc_journey_letter_unchecked','ttc_journey_invite',
     'ttc_journey_invite_unflagged','ttc_casino_action','ttc_casino_action_core','ttc_journey_action','ttc_journey_action_uncarded',
     'ttc_casino_spin_total','ttc_casino_raise_promise','ttc_casino_promise_on_letter',
     'ttc_journey_milestone_json','ttc_journey_milestone_json_zoneless') loop
   execute format('revoke all on function %s from public, anon, authenticated', obj.signature);
   execute format('grant execute on function %s to service_role', obj.signature);
 end loop;
end $$;
