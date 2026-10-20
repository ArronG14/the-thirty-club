-- The communication hold (ADR-021, docs/FINAL_INTEGRATION_RELEASE_HANDOVER.md).
-- The owner's instruction of 20 October 2026: Alise receives nothing new from
-- the club (no letter published to her, no SMS approved or sent to her) until
-- the owner explicitly releases communications, and never before
-- 21 October 2026 00:00 in Jamaica.
--
-- Enforced in the database, so no route, retry, scheduler, deployment or
-- future code path can bypass it:
--   * a trigger refuses to publish any letter while held;
--   * a trigger refuses to approve or send any SMS to Alise while held;
--   * due Desk letters, due journey milestones and journey events wait;
--   * approved-but-unsent SMS to Alise are cancelled when the hold starts
--     (the owner can resend each one after release);
--   * release is an explicit owner action, refused before the earliest date,
--     and never delivers anything that fell due during the hold by itself.
-- Additive: one table, three triggers, three wrapped schedulers and a new
-- RPC. Nothing already published or sent is changed or recalled.

create table public.ttc_communication_hold (
  id boolean primary key default true check (id),
  active boolean not null,
  held_since timestamptz not null default now(),
  release_not_before timestamptz not null,
  released_at timestamptz,
  release_note text check (release_note is null or length(release_note) <= 300),
  updated_at timestamptz not null default now(),
  check (active or released_at is not null)
);
insert into public.ttc_communication_hold(id, active, release_not_before)
  values (true, true, '2026-10-21 00:00:00-05')
  on conflict (id) do nothing;

-- Fails closed: a missing row counts as held.
create function public.ttc_communications_held() returns boolean
language sql stable set search_path = '' as $$
 select coalesce((select active from public.ttc_communication_hold where id), true)
$$;

create function public.ttc_alise_category(p_category text) returns boolean
language sql immutable set search_path = '' as $$
 select p_category in ('scheduled-alise', 'correspondence-alise')
$$;

-- Approved SMS to Alise that have not left are cancelled, with the reason.
create function public.ttc_hold_cancel_alise_sms() returns integer
language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
 with held as (
   update public.ttc_messages set state = 'cancelled', approved_at = null,
     last_error = 'Held: the owner has paused all communications to Alise. Resend after release if still wanted.'
   where public.ttc_alise_category(category) and state = 'approved'
   returning id)
 insert into public.ttc_message_delivery_logs(message_id, state, error)
   select id, 'cancelled', 'Communication hold' from held;
 get diagnostics n = row_count;
 return n;
end $$;

-- The hold starts now: nothing approved for Alise may leave.
do $$ declare n integer; begin
 n := public.ttc_hold_cancel_alise_sms();
 insert into public.ttc_activity_events(type, detail)
   values ('communications.held', jsonb_build_object('via', 'migration', 'smsCancelled', n,
     'releaseNotBefore', '2026-10-21T05:00:00Z'));
end $$;

/* ---------- Enforcement ---------- */

create function public.ttc_hold_letters() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
 if new.state = 'published' and (tg_op = 'INSERT' or old.state is distinct from 'published')
    and public.ttc_communications_held() then
   perform public.ttc_fail('on-hold');
 end if;
 return new;
end $$;
create trigger ttc_hold_letters before insert or update on public.ttc_letters
  for each row execute function public.ttc_hold_letters();

create function public.ttc_hold_messages() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
 if public.ttc_alise_category(new.category) and new.state in ('approved', 'sending')
    and (tg_op = 'INSERT' or old.state is distinct from new.state)
    and public.ttc_communications_held() then
   perform public.ttc_fail('on-hold');
 end if;
 return new;
end $$;
create trigger ttc_hold_messages before insert or update on public.ttc_messages
  for each row execute function public.ttc_hold_messages();

-- The schedulers wait while held (so the every-minute round, and every
-- read that publishes lazily, keep working and deliver nothing).
alter function public.ttc_correspondence_publish_due(jsonb) rename to ttc_correspondence_publish_due_unheld;
create function public.ttc_correspondence_publish_due(p_templates jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
begin
 if public.ttc_communications_held() then return 0; end if;
 return public.ttc_correspondence_publish_due_unheld(p_templates);
end $$;

alter function public.ttc_journey_fire_due(uuid, jsonb) rename to ttc_journey_fire_due_unheld;
create function public.ttc_journey_fire_due(p_member uuid, p_tpl jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
begin
 if public.ttc_communications_held() then return 0; end if;
 return public.ttc_journey_fire_due_unheld(p_member, p_tpl);
end $$;

alter function public.ttc_journey_process_events(uuid, jsonb) rename to ttc_journey_process_events_unheld;
create function public.ttc_journey_process_events(p_member uuid, p_tpl jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
begin
 if public.ttc_communications_held() then return 0; end if;
 return public.ttc_journey_process_events_unheld(p_member, p_tpl);
end $$;

-- The original 20 October Lounge introduction no longer exists: the
-- journey seeds early admission held at 21 Oct 19:00 UK (owner approval).

/* ---------- Owner controls ---------- */

create function public.ttc_hold_json() returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object(
   'active', public.ttc_communications_held(),
   'heldSince', h.held_since, 'releaseNotBefore', h.release_not_before,
   'releasedAt', h.released_at, 'releaseNote', h.release_note, 'now', now(),
   'waiting', jsonb_build_object(
     'lettersDue', (select count(*) from public.ttc_letters where state = 'scheduled' and deliver_at <= now()),
     'lettersScheduled', (select count(*) from public.ttc_letters where state = 'scheduled'),
     'milestonesDue', (select count(*) from public.ttc_journey_milestones where state = 'pending' and fire_at <= now()),
     'eventsWaiting', (select count(*) from public.ttc_journey_events where state = 'pending'),
     'smsCancelledByHold', (select count(*) from public.ttc_messages where state = 'cancelled'
        and last_error like 'Held: the owner has paused all communications%')))
 from public.ttc_communication_hold h where h.id
$$;

create function public.ttc_hold_action(p_actor uuid, p_role text, p_action text, p_input jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare h public.ttc_communication_hold; letters integer; milestones integer; events integer; sms integer;
begin
 if p_role not in ('system', 'owner') or p_role is null then perform public.ttc_fail('forbidden'); end if;
 if p_action like 'owner-%' and p_role <> 'owner' then perform public.ttc_fail('forbidden'); end if;
 if p_action like 'system-%' and p_role <> 'system' then perform public.ttc_fail('forbidden'); end if;

 if p_action in ('owner-communications', 'system-communications') then
   return public.ttc_hold_json();

 elsif p_action = 'owner-communications-hold' then
   select * into h from public.ttc_communication_hold where id for update;
   if h.active then return public.ttc_hold_json() || '{"duplicate":true}'; end if;
   update public.ttc_communication_hold set active = true, held_since = now(), updated_at = now() where id;
   sms := public.ttc_hold_cancel_alise_sms();
   insert into public.ttc_activity_events(type, detail)
     values ('communications.held', jsonb_build_object('via', 'owner', 'smsCancelled', sms));
   return public.ttc_hold_json() || '{"duplicate":false}';

 elsif p_action = 'owner-communications-release' then
   if coalesce(p_input->>'confirm', '') <> 'RELEASE' then perform public.ttc_fail('invalid'); end if;
   select * into h from public.ttc_communication_hold where id for update;
   if h.id is null then perform public.ttc_fail('not-configured'); end if;
   if not h.active then return public.ttc_hold_json() || '{"duplicate":true}'; end if;
   if now() < h.release_not_before then perform public.ttc_fail('not-open'); end if;
   -- Nothing that fell due during the hold goes out by itself: each must be
   -- confirmed again by the owner.
   update public.ttc_letters set state = 'draft', scheduled_at = null, updated_at = now()
     where state = 'scheduled' and deliver_at <= now();
   get diagnostics letters = row_count;
   update public.ttc_journey_milestones set state = 'held', updated_at = now()
     where state = 'pending' and fire_at <= now();
   get diagnostics milestones = row_count;
   update public.ttc_journey_events set state = 'failed', attempts = attempts + 1,
       last_error = 'Received during the communication hold; retry to deliver its letter.'
     where state = 'pending';
   get diagnostics events = row_count;
   update public.ttc_communication_hold set active = false, released_at = now(),
     release_note = left(nullif(btrim(coalesce(p_input->>'note', '')), ''), 300), updated_at = now() where id;
   insert into public.ttc_activity_events(type, detail)
     values ('communications.released', jsonb_build_object('lettersReturnedToDraft', letters,
       'milestonesHeld', milestones, 'eventsToRetry', events));
   return public.ttc_hold_json() || jsonb_build_object('duplicate', false, 'released',
     jsonb_build_object('lettersReturnedToDraft', letters, 'milestonesHeld', milestones, 'eventsToRetry', events));
 end if;
 perform public.ttc_fail('not-found'); return null;
end $$;

alter table public.ttc_communication_hold enable row level security;
revoke all on public.ttc_communication_hold from public, anon, authenticated;
grant all on public.ttc_communication_hold to service_role;
create policy service_only on public.ttc_communication_hold for all to service_role using (true) with check (true);
do $$ declare obj record; begin
 for obj in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and (p.proname like 'ttc_hold%' or p.proname in ('ttc_communications_held', 'ttc_alise_category',
     'ttc_correspondence_publish_due', 'ttc_correspondence_publish_due_unheld', 'ttc_journey_fire_due',
     'ttc_journey_fire_due_unheld', 'ttc_journey_process_events', 'ttc_journey_process_events_unheld')) loop
   execute format('revoke all on function %s from public, anon, authenticated', obj.signature);
   execute format('grant execute on function %s to service_role', obj.signature);
 end loop;
end $$;
