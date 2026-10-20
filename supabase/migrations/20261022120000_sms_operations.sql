-- SMS operations (ADR-022, docs/FINAL_INTEGRATION_RELEASE_HANDOVER.md).
--
-- One authoritative, persistent SMS operating mode, enforced by the server
-- at every sending boundary:
--   off       — nothing is sent (the default; a missing or unreadable mode
--               counts as off);
--   rehearsal — nothing real leaves the outbox; the owner may send a
--               rehearsal copy of a message to his own verified number;
--   live      — the outbox sends, and a message to Alise additionally needs
--               the communication hold released and an approval given after
--               LIVE was switched on (so switching to LIVE never flushes an
--               old backlog).
-- `SMS_SENDING_ENABLED=true` only makes the Twilio transport available; it
-- never authorises a message by itself.
--
-- Additive: two tables, functions and one RPC (`ttc_sms_action`), plus one
-- draft (unapproved) message: the Butler's 21 October teaser.

create table public.ttc_sms_operations (
  id boolean primary key default true check (id),
  mode text not null default 'off' check (mode in ('off', 'rehearsal', 'live')),
  live_since timestamptz,
  changed_at timestamptz,
  changed_by text,
  check ((mode = 'live') = (live_since is not null))
);
insert into public.ttc_sms_operations(id, mode) values (true, 'off') on conflict (id) do nothing;

-- Rehearsal copies sent to the owner's own number: kept apart from the LIVE
-- outbox, so a rehearsal never touches a LIVE message's state.
create table public.ttc_sms_rehearsals (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique check (idempotency_key ~ '^[A-Za-z0-9_-]{8,80}$'),
  source_kind text not null check (source_kind in ('message', 'milestone')),
  source_id text not null check (length(source_id) between 1 and 80),
  live_body text not null check (length(live_body) between 1 and 1600),
  body text not null check (length(body) between 1 and 1600),
  state text not null default 'requested' check (state in ('requested', 'accepted', 'failed')),
  provider_sid text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- Fails closed: anything other than a readable, valid row is off.
create function public.ttc_sms_mode() returns text
language sql stable set search_path = '' as $$
 select coalesce((select mode from public.ttc_sms_operations where id), 'off')
$$;

/* ---------- The outbox claim (replaces system-message-claim's use) ---------- */

-- Claims one message the policy allows to leave now, or returns null. The
-- mode is read in the same transaction as the claim.
create function public.ttc_sms_claim() returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare m public.ttc_messages; ops public.ttc_sms_operations;
begin
 select * into ops from public.ttc_sms_operations where id for share;
 if ops.mode is distinct from 'live' then return 'null'::jsonb; end if;
 -- A crashed/in-flight request may have reached Twilio: hold it, never blind retry.
 with stale as (update public.ttc_messages set state = 'uncertain',
     last_error = 'Worker interrupted; reconcile with Twilio before any resend.'
   where state = 'sending' and claimed_at < now() - interval '2 minutes' returning id)
 insert into public.ttc_message_delivery_logs(message_id, state, error)
   select id, 'uncertain', 'Worker interrupted' from stale;
 update public.ttc_messages set state = 'failed', last_error = 'Scheduled time missed; review and reschedule.', approved_at = null
   where category = 'scheduled-alise' and state = 'approved' and send_at < now() - interval '30 minutes';
 select * into m from public.ttc_messages
   where state = 'approved' and approved_at is not null and send_at <= now()
     and coalesce(next_attempt_at, send_at) <= now() and attempts < 5
     and (not public.ttc_alise_category(category)
          or (not public.ttc_communications_held() and approved_at >= ops.live_since))
   order by send_at limit 1 for update skip locked;
 if m.id is null then return 'null'::jsonb; end if;
 update public.ttc_messages set state = 'sending', claimed_at = now(), claim_id = gen_random_uuid(),
   attempts = attempts + 1 where id = m.id returning * into m;
 insert into public.ttc_message_delivery_logs(message_id, state) values (m.id, 'sending');
 return public.ttc_message_json(m) || jsonb_build_object('claimId', m.claim_id);
end $$;

/* ---------- Owner view ---------- */

create function public.ttc_sms_status(m public.ttc_messages) returns text
language sql stable set search_path = '' as $$
 select case
   when m.state = 'cancelled' and m.last_error like 'Held:%' then 'held'
   when m.state = 'approved' and public.ttc_alise_category(m.category) and public.ttc_communications_held() then 'held'
   when m.state = 'approved' and public.ttc_sms_mode() <> 'live' then 'paused'
   when m.state = 'approved' and public.ttc_alise_category(m.category)
        and m.approved_at < (select live_since from public.ttc_sms_operations where id) then 'awaiting-approval'
   when m.state = 'approved' then 'queued'
   when m.state = 'accepted' then 'sent'
   else m.state end
$$;

create function public.ttc_sms_overview() returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object(
   'mode', public.ttc_sms_mode(),
   'liveSince', (select live_since from public.ttc_sms_operations where id),
   'changedAt', (select changed_at from public.ttc_sms_operations where id),
   'holdActive', public.ttc_communications_held(),
   'now', now(),
   'messages', coalesce((select jsonb_agg(jsonb_build_object(
       'id', x.id, 'label', x.label, 'body', x.body,
       'audience', case when public.ttc_alise_category(x.category) then 'alise' else 'arron' end,
       'category', x.category, 'state', x.state, 'status', public.ttc_sms_status(x),
       'sendAt', x.send_at, 'approvedAt', x.approved_at, 'attempts', x.attempts,
       'lastError', x.last_error, 'createdAt', x.created_at) order by coalesce(x.send_at, x.created_at) desc)
     from (select * from public.ttc_messages order by coalesce(send_at, created_at) desc limit 150) x), '[]'),
   'rehearsals', coalesce((select jsonb_agg(jsonb_build_object(
       'id', r.id, 'sourceKind', r.source_kind, 'sourceId', r.source_id, 'body', r.body,
       'state', r.state, 'error', r.error, 'createdAt', r.created_at, 'sentAt', r.sent_at)
       order by r.created_at desc)
     from (select * from public.ttc_sms_rehearsals order by created_at desc limit 50) r), '[]'))
$$;

/* ---------- The RPC ---------- */

create function public.ttc_sms_action(p_actor uuid, p_role text, p_action text, p_input jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare ops public.ttc_sms_operations; m public.ttc_messages; r public.ttc_sms_rehearsals;
  v_mode text; v_body text; v_at timestamptz; ms public.ttc_journey_milestones; eff jsonb; i integer;
begin
 if p_role not in ('system', 'owner') or p_role is null then perform public.ttc_fail('forbidden'); end if;
 if p_action like 'owner-%' and p_role <> 'owner' then perform public.ttc_fail('forbidden'); end if;
 if p_action like 'system-%' and p_role <> 'system' then perform public.ttc_fail('forbidden'); end if;

 if p_action = 'system-sms-policy' then
   return jsonb_build_object('mode', public.ttc_sms_mode(), 'holdActive', public.ttc_communications_held(),
     'liveSince', (select live_since from public.ttc_sms_operations where id));

 elsif p_action = 'system-sms-claim' then
   return public.ttc_sms_claim();

 elsif p_action = 'system-sms-unclaim' then
   -- The policy changed between claim and provider call: the message goes
   -- back unsent (held if it is for Alise and the hold is now active).
   select * into m from public.ttc_messages where id = (p_input->>'id')::uuid for update;
   if m.id is null or m.state <> 'sending' or m.claim_id is distinct from (p_input->>'claimId')::uuid then
     perform public.ttc_fail('conflict');
   end if;
   if public.ttc_alise_category(m.category) and public.ttc_communications_held() then
     update public.ttc_messages set state = 'cancelled', approved_at = null, claim_id = null, claimed_at = null,
       attempts = greatest(attempts - 1, 0),
       last_error = 'Held: the owner has paused all communications to Alise. Resend after release if still wanted.'
       where id = m.id;
   else
     update public.ttc_messages set state = 'approved', claim_id = null, claimed_at = null,
       attempts = greatest(attempts - 1, 0), last_error = left(coalesce(p_input->>'reason', 'Not sent: SMS policy changed.'), 300)
       where id = m.id;
   end if;
   insert into public.ttc_message_delivery_logs(message_id, state, error) values (m.id, 'approved', 'Unclaimed: policy changed before sending');
   return jsonb_build_object('ok', true);

 elsif p_action = 'owner-sms' then
   return public.ttc_sms_overview();

 elsif p_action = 'owner-sms-mode' then
   v_mode := p_input->>'mode';
   if v_mode not in ('off', 'rehearsal', 'live') then perform public.ttc_fail('invalid'); end if;
   select * into ops from public.ttc_sms_operations where id for update;
   if ops.id is null then
     insert into public.ttc_sms_operations(id, mode) values (true, 'off') returning * into ops;
   end if;
   if ops.mode = v_mode then return public.ttc_sms_overview() || '{"duplicate":true}'; end if;
   update public.ttc_sms_operations set mode = v_mode,
     live_since = case when v_mode = 'live' then now() end,
     changed_at = now(), changed_by = 'owner' where id;
   insert into public.ttc_activity_events(type, detail)
     values ('sms.mode', jsonb_build_object('from', ops.mode, 'to', v_mode, 'by', 'owner', 'actor', p_actor));
   return public.ttc_sms_overview() || '{"duplicate":false}';

 elsif p_action = 'owner-sms-approve' then
   -- Approves a queued message to Alise for sending now that LIVE is on
   -- (deliberate review of a backlog; never automatic).
   select * into m from public.ttc_messages where id = (p_input->>'id')::uuid for update;
   if m.id is null then perform public.ttc_fail('not-found'); end if;
   if m.state <> 'approved' then perform public.ttc_fail('conflict'); end if;
   if public.ttc_sms_mode() <> 'live' then perform public.ttc_fail('not-open'); end if;
   if public.ttc_alise_category(m.category) and public.ttc_communications_held() then perform public.ttc_fail('on-hold'); end if;
   update public.ttc_messages set approved_at = now(), next_attempt_at = now(), last_error = null where id = m.id returning * into m;
   insert into public.ttc_activity_events(type, detail) values ('sms.approved', jsonb_build_object('messageId', m.id));
   return jsonb_build_object('message', public.ttc_message_json(m));

 elsif p_action = 'owner-sms-rehearsal-source' then
   -- The exact text Alise would receive, from the same records and templates.
   if p_input->>'kind' = 'message' then
     select * into m from public.ttc_messages where id = (p_input->>'id')::uuid;
     if m.id is null or not public.ttc_alise_category(m.category) then perform public.ttc_fail('not-found'); end if;
     return jsonb_build_object('liveBody', m.body, 'sendAt', m.send_at, 'seedKey', m.seed_key);
   elsif p_input->>'kind' = 'milestone' then
     select * into ms from public.ttc_journey_milestones where key = p_input->>'id';
     if ms.key is null then perform public.ttc_fail('not-found'); end if;
     for i in 0 .. jsonb_array_length(ms.effects) - 1 loop
       eff := ms.effects->i;
       if eff->>'type' = 'invite-room' then
         v_body := public.ttc_journey_letter_sms(p_input->'journey', ms.fire_at, 'admission', eff->>'room');
       elsif eff->>'type' = 'letter' then
         v_body := public.ttc_journey_letter_sms(p_input->'journey', ms.fire_at, eff->'action'->>'kind', eff->'action'->>'room');
       end if;
       exit when v_body is not null;
     end loop;
     if v_body is null then perform public.ttc_fail('invalid'); end if;
     return jsonb_build_object('liveBody', v_body, 'sendAt', ms.fire_at);
   end if;
   perform public.ttc_fail('invalid');

 elsif p_action = 'owner-sms-rehearsal-create' then
   insert into public.ttc_sms_rehearsals(idempotency_key, source_kind, source_id, live_body, body)
     values (p_input->>'idempotencyKey', p_input->>'kind', p_input->>'id', p_input->>'liveBody', p_input->>'body')
     on conflict (idempotency_key) do nothing returning * into r;
   if r.id is null then
     select * into r from public.ttc_sms_rehearsals where idempotency_key = p_input->>'idempotencyKey';
     return jsonb_build_object('rehearsal', jsonb_build_object('id', r.id, 'state', r.state, 'body', r.body, 'error', r.error), 'duplicate', true);
   end if;
   insert into public.ttc_activity_events(type, detail)
     values ('sms.rehearsal', jsonb_build_object('rehearsalId', r.id, 'kind', r.source_kind, 'source', r.source_id));
   return jsonb_build_object('rehearsal', jsonb_build_object('id', r.id, 'state', r.state, 'body', r.body, 'error', r.error), 'duplicate', false);

 elsif p_action = 'owner-sms-rehearsal-result' then
   update public.ttc_sms_rehearsals set state = p_input->>'state', provider_sid = p_input->>'providerSid',
     error = left(p_input->>'error', 300), sent_at = case when p_input->>'state' = 'accepted' then now() end
     where id = (p_input->>'id')::uuid and state = 'requested' returning * into r;
   if r.id is null then perform public.ttc_fail('conflict'); end if;
   return jsonb_build_object('rehearsal', jsonb_build_object('id', r.id, 'state', r.state, 'body', r.body, 'error', r.error), 'duplicate', false);
 end if;
 perform public.ttc_fail('not-found'); return null;
end $$;

/* ---------- The Butler's 21 October teaser (a draft, never approved here) ---------- */

insert into public.ttc_messages(seed_key, label, body, category, send_at, timezone, state)
values ('butler-teaser-2026-10-21', 'Butler · early-access teaser',
'Madam, as the working day draws to a close, I am pleased to report that I have managed to pull a few strings on your behalf.
It would appear that your admission may take place rather sooner than originally anticipated.
I shall forward your formal documentation this evening.
In the meantime, you may wish to take another look at the entrance.
https://30.ag14.co
Until then, Madam.
— The Butler',
'scheduled-alise', '2026-10-21 16:00:00+01', 'Europe/London', 'draft')
on conflict (seed_key) do nothing;

/* ---------- Security ---------- */

alter table public.ttc_sms_operations enable row level security;
alter table public.ttc_sms_rehearsals enable row level security;
revoke all on public.ttc_sms_operations, public.ttc_sms_rehearsals from public, anon, authenticated;
grant all on public.ttc_sms_operations, public.ttc_sms_rehearsals to service_role;
create policy service_only on public.ttc_sms_operations for all to service_role using (true) with check (true);
create policy service_only on public.ttc_sms_rehearsals for all to service_role using (true) with check (true);
do $$ declare obj record; begin
 for obj in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'ttc_sms%' loop
   execute format('revoke all on function %s from public, anon, authenticated', obj.signature);
   execute format('grant execute on function %s to service_role', obj.signature);
 end loop;
end $$;
