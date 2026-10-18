-- All authority is behind Netlify. Browser database roles have no grants.
create table public.ttc_members (
  id uuid primary key default gen_random_uuid(), slug text unique not null,
  name text not null, enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.ttc_sessions (
  token_hash text primary key, role text not null check (role in ('member','owner')),
  member_id uuid references public.ttc_members(id), expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check ((role = 'member') = (member_id is not null))
);
create index ttc_sessions_member_idx on public.ttc_sessions(member_id);
create table public.ttc_nfc_assignments (
  id uuid primary key default gen_random_uuid(), member_id uuid not null references public.ttc_members(id),
  token_hash text unique not null, kind text not null default 'invitation' check (kind in ('invitation','nfc')),
  expires_at timestamptz not null, consumed_at timestamptz, revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index ttc_nfc_member_idx on public.ttc_nfc_assignments(member_id);
create table public.ttc_rate_limits (
  bucket text primary key, hits integer not null, expires_at timestamptz not null
);
create table public.ttc_privileges (
  id uuid primary key default gen_random_uuid(), slug text unique not null check (slug ~ '^[a-z0-9-]{3,60}$'),
  title text not null check (length(title) between 1 and 100),
  description text not null default '' check (length(description) <= 1000),
  kind text not null check (kind in ('beauty','drink')), enabled boolean not null default true,
  opens_at timestamptz not null, closes_at timestamptz,
  min_amount_pence integer, max_amount_pence integer,
  check (closes_at is null or closes_at > opens_at),
  check ((kind = 'beauty' and min_amount_pence > 0 and max_amount_pence >= min_amount_pence)
    or (kind = 'drink' and min_amount_pence is null and max_amount_pence is null))
);
create table public.ttc_reward_balances (
  member_id uuid primary key references public.ttc_members(id),
  quantity numeric not null default 0 check (quantity >= 0 and scale(quantity) = 0)
);
create table public.ttc_reward_transactions (
  id uuid primary key default gen_random_uuid(), member_id uuid not null references public.ttc_members(id),
  delta numeric not null check (scale(delta) = 0 and delta <> 0), reason text not null,
  idempotency_key text not null, fingerprint jsonb not null,
  created_at timestamptz not null default now(), unique(member_id,idempotency_key)
);
create table public.ttc_redemptions (
  id uuid primary key default gen_random_uuid(), member_id uuid not null references public.ttc_members(id),
  privilege_id uuid not null references public.ttc_privileges(id),
  kind text not null check (kind in ('beauty','drink')),
  state text not null default 'pending' check (state in ('pending','fulfilled')),
  amount_pence integer, quantity numeric,
  idempotency_key text not null, fingerprint jsonb not null,
  created_at timestamptz not null default now(), fulfilled_at timestamptz,
  check ((kind = 'beauty' and amount_pence > 0 and quantity is null)
    or (kind = 'drink' and amount_pence is null and quantity > 0 and scale(quantity) = 0)),
  unique(member_id,idempotency_key)
);
create unique index ttc_beauty_once_idx on public.ttc_redemptions(member_id,privilege_id) where kind = 'beauty';
create index ttc_redemptions_privilege_idx on public.ttc_redemptions(privilege_id);
create table public.ttc_slot_plays (
  id uuid primary key default gen_random_uuid(), member_id uuid not null references public.ttc_members(id),
  idempotency_key text not null, result jsonb not null, created_at timestamptz not null default now(),
  unique(member_id,idempotency_key)
);
create table public.ttc_messages (
  id uuid primary key default gen_random_uuid(), seed_key text unique,
  redemption_id uuid unique references public.ttc_redemptions(id),
  label text not null check (length(label) between 1 and 100), body text not null check (length(body) between 1 and 1600),
  category text not null check (category in ('scheduled-alise','transactional-arron')),
  send_at timestamptz, timezone text not null,
  state text not null default 'draft' check (state in ('draft','approved','sending','accepted','delivered','failed','uncertain','cancelled')),
  approved_at timestamptz, attempts integer not null default 0, next_attempt_at timestamptz,
  claimed_at timestamptz, claim_id uuid, provider_sid text unique, last_error text,
  created_at timestamptz not null default now()
);
create index ttc_messages_due_idx on public.ttc_messages(send_at,next_attempt_at) where state = 'approved';
create table public.ttc_message_delivery_logs (
  id uuid primary key default gen_random_uuid(), message_id uuid not null references public.ttc_messages(id),
  state text not null, provider_sid text, error text, created_at timestamptz not null default now()
);
create index ttc_delivery_message_idx on public.ttc_message_delivery_logs(message_id);
create table public.ttc_activity_events (
  id uuid primary key default gen_random_uuid(), type text not null,
  detail jsonb not null default '{}', created_at timestamptz not null default now()
);

create function public.ttc_fail(code text) returns void language plpgsql set search_path = '' as $$
begin raise exception using message = code; end $$;

create function public.ttc_redemption_json(r public.ttc_redemptions) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object('id',r.id,'privilegeId',r.privilege_id,'memberId',r.member_id,
 'state',r.state,'amountPence',r.amount_pence,'currency',case when r.kind='beauty' then 'GBP' end,
 'quantity',r.quantity::text,'createdAt',r.created_at,'fulfilledAt',r.fulfilled_at,
 'notificationState',coalesce((select m.state from public.ttc_messages m where m.redemption_id=r.id),'draft'))
$$;
create function public.ttc_privilege_json(p public.ttc_privileges, member uuid) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object('id',p.id,'slug',p.slug,'title',p.title,'description',p.description,
 'kind',p.kind,'enabled',p.enabled,'opensAt',p.opens_at,'closesAt',p.closes_at,
 'minAmountPence',p.min_amount_pence,'maxAmountPence',p.max_amount_pence,
 'available',p.enabled and now()>=p.opens_at and (p.closes_at is null or now()<p.closes_at)
   and (p.kind<>'beauty' or not exists(select 1 from public.ttc_redemptions r where r.member_id=member and r.privilege_id=p.id)),
 'unavailableReason',case when not p.enabled then 'disabled' when now()<p.opens_at then 'not-open'
 when p.closes_at is not null and now()>=p.closes_at then 'expired'
 when p.kind='beauty' and exists(select 1 from public.ttc_redemptions r where r.member_id=member and r.privilege_id=p.id) then 'already-redeemed' end,
 'redemption',(select public.ttc_redemption_json(r) from public.ttc_redemptions r where r.member_id=member and r.privilege_id=p.id order by r.created_at desc limit 1))
$$;
create function public.ttc_balance_json(member uuid) returns jsonb language sql stable set search_path = '' as $$
 select jsonb_build_object('reward','drink-voucher','unit','voucher','quantity',coalesce((select quantity::text from public.ttc_reward_balances where member_id=member),'0'))
$$;
create function public.ttc_message_json(m public.ttc_messages) returns jsonb language sql stable set search_path = '' as $$
 select jsonb_build_object('id',m.id,'label',m.label,'body',m.body,'category',m.category,
 'sendAt',m.send_at,'timezone',m.timezone,'state',m.state,'approvedAt',m.approved_at,
 'attempts',m.attempts,'providerSid',m.provider_sid,'lastError',m.last_error)
$$;

-- Service-role only. The actor and role come exclusively from a verified server session.
create function public.ttc_action(p_actor uuid, p_role text, p_action text, p_input jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 member uuid; p public.ttc_privileges; r public.ttc_redemptions; m public.ttc_messages;
 old jsonb; result jsonb; fp jsonb; delta numeric; qty numeric; bonus numeric;
 amount integer; play_count integer; action_id uuid; found_hash text; expires timestamptz;
begin
 select id into member from public.ttc_members where slug='alise' and enabled;
 if member is null then perform public.ttc_fail('not-configured'); end if;
 if p_role='member' and (p_actor is distinct from member) then perform public.ttc_fail('forbidden'); end if;
 if p_role not in ('system','owner','member') or p_role is null then perform public.ttc_fail('forbidden'); end if;
 if p_action like 'owner-%' and p_role<>'owner' then perform public.ttc_fail('forbidden'); end if;
 if p_action like 'system-%' and p_role<>'system' then perform public.ttc_fail('forbidden'); end if;
 if p_action in ('redeem','slots-play','privileges','redemptions','redemption','balances','transactions') and p_role<>'member' then perform public.ttc_fail('forbidden'); end if;

 if p_action='system-rate' then
   delete from public.ttc_rate_limits where expires_at<now();
   insert into public.ttc_rate_limits(bucket,hits,expires_at) values(p_input->>'bucket',1,now()+interval '15 minutes')
   on conflict(bucket) do update set hits=public.ttc_rate_limits.hits+1 returning hits into amount;
   return jsonb_build_object('allowed',amount<=8);
 elsif p_action='system-session-create' then
   expires := now()+interval '8 hours';
   insert into public.ttc_sessions(token_hash,role,expires_at) values(p_input->>'hash','owner',expires);
   return jsonb_build_object('role','owner','memberId',null,'expiresAt',expires);
 elsif p_action='system-member-exchange' then
   select token_hash into found_hash from public.ttc_nfc_assignments
    where token_hash=p_input->>'invitationHash' and consumed_at is null and revoked_at is null and expires_at>now()
    and member_id=member for update;
   if found_hash is null then perform public.ttc_fail('unauthorised'); end if;
   update public.ttc_nfc_assignments set consumed_at=now() where token_hash=found_hash;
   expires := now()+interval '30 days';
   insert into public.ttc_sessions(token_hash,role,member_id,expires_at) values(p_input->>'hash','member',member,expires);
   insert into public.ttc_activity_events(type) values('membership.activated');
   return jsonb_build_object('role','member','memberId',member,'expiresAt',expires);
 elsif p_action='system-session-read' then
   select jsonb_build_object('role',s.role,'memberId',s.member_id,'expiresAt',s.expires_at) into result
   from public.ttc_sessions s where token_hash=p_input->>'hash' and expires_at>now()
   and (s.role='owner' or s.member_id=member);
   if result is null then perform public.ttc_fail('unauthorised'); end if;
   return result;
 elsif p_action='system-session-delete' then
   delete from public.ttc_sessions where token_hash=p_input->>'hash'; return '{"ok":true}';
 elsif p_action='owner-invitation' then
   expires := now()+interval '7 days';
   insert into public.ttc_nfc_assignments(member_id,token_hash,expires_at) values(member,p_input->>'hash',expires);
   insert into public.ttc_activity_events(type) values('membership.invitation-created');
   return jsonb_build_object('expiresAt',expires);
 elsif p_action='owner-revoke' then
   delete from public.ttc_sessions where member_id=member;
   update public.ttc_nfc_assignments set revoked_at=now() where member_id=member and consumed_at is null;
   insert into public.ttc_activity_events(type) values('membership.sessions-revoked'); return '{"ok":true}';
 elsif p_action='privileges' then
   return jsonb_build_object('privileges',coalesce((select jsonb_agg(public.ttc_privilege_json(x,member) order by x.slug) from public.ttc_privileges x),'[]'));
 elsif p_action='redemptions' then
   return jsonb_build_object('redemptions',coalesce((select jsonb_agg(public.ttc_redemption_json(x)) from (select * from public.ttc_redemptions where member_id=member order by created_at desc limit 100) x),'[]'));
 elsif p_action='redemption' then
   select * into r from public.ttc_redemptions where id=(p_input->>'id')::uuid and member_id=member;
   if r.id is null then perform public.ttc_fail('not-found'); end if;
   return jsonb_build_object('redemption',public.ttc_redemption_json(r));
 elsif p_action='balances' then return jsonb_build_object('balances',jsonb_build_array(public.ttc_balance_json(member)));
 elsif p_action='transactions' then
   return jsonb_build_object('transactions',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'delta',x.delta::text,'reason',x.reason,'createdAt',x.created_at)) from (select * from public.ttc_reward_transactions where member_id=member order by created_at desc limit 100) x),'[]'));
 elsif p_action='redeem' then
   perform 1 from public.ttc_members where id=member for update;
   if coalesce(p_input->>'idempotencyKey','') !~ '^[A-Za-z0-9_-]{8,80}$' then perform public.ttc_fail('invalid'); end if;
   fp := p_input - 'idempotencyKey';
   select * into r from public.ttc_redemptions where member_id=member and idempotency_key=p_input->>'idempotencyKey';
   if r.id is not null then
     if r.fingerprint<>fp then perform public.ttc_fail('idempotency-conflict'); end if;
     return jsonb_build_object('redemption',public.ttc_redemption_json(r),'duplicate',true);
   end if;
   select * into p from public.ttc_privileges where id=(p_input->>'privilegeId')::uuid for share;
   if p.id is null then perform public.ttc_fail('not-found'); end if;
   if p.kind='beauty' then
     select * into r from public.ttc_redemptions where member_id=member and privilege_id=p.id;
     if r.id is not null then return jsonb_build_object('error','already-redeemed','redemption',public.ttc_redemption_json(r)); end if;
   end if;
   if not p.enabled then perform public.ttc_fail('forbidden'); end if;
   if now()<p.opens_at then perform public.ttc_fail('not-open'); end if;
   if p.closes_at is not null and now()>=p.closes_at then perform public.ttc_fail('expired'); end if;
   if p.kind='beauty' then
     if jsonb_typeof(p_input->'amountPence') is distinct from 'number' or p_input ? 'quantity'
       or (p_input->>'amountPence') !~ '^[0-9]+$' then perform public.ttc_fail('invalid'); end if;
     amount := (p_input->>'amountPence')::integer;
     if amount<p.min_amount_pence or amount>p.max_amount_pence then perform public.ttc_fail('invalid'); end if;
   else
     if jsonb_typeof(p_input->'quantity') is distinct from 'string' or p_input ? 'amountPence'
       or (p_input->>'quantity') !~ '^[1-9][0-9]*$' or length(p_input->>'quantity')>1000 then perform public.ttc_fail('invalid'); end if;
     qty := (p_input->>'quantity')::numeric;
     update public.ttc_reward_balances set quantity=quantity-qty where member_id=member and quantity>=qty;
     if not found then perform public.ttc_fail('insufficient-balance'); end if;
   end if;
   insert into public.ttc_redemptions(member_id,privilege_id,kind,amount_pence,quantity,idempotency_key,fingerprint)
     values(member,p.id,p.kind,amount,qty,p_input->>'idempotencyKey',fp) returning * into r;
   if qty is not null then
     insert into public.ttc_reward_transactions(member_id,delta,reason,idempotency_key,fingerprint)
       values(member,-qty,'redemption:'||r.id,'redemption:'||r.id,fp);
   end if;
   insert into public.ttc_messages(redemption_id,label,body,category,send_at,timezone)
     values(r.id,p.title,'Alise has claimed '||p.title||case when amount is not null then ' — GBP '||to_char(amount/100.0,'FM999999990.00') else ' — '||qty||' drink vouchers' end||'. Please visit the Butler''s Office.','transactional-arron',now(),'Europe/London');
   insert into public.ttc_activity_events(type,detail) values('redemption.created',jsonb_build_object('redemptionId',r.id,'privilegeId',p.id));
   return jsonb_build_object('redemption',public.ttc_redemption_json(r),'duplicate',false);
 elsif p_action='slots-play' then
   perform 1 from public.ttc_members where id=member for update;
   if coalesce(p_input->>'idempotencyKey','') !~ '^[A-Za-z0-9_-]{8,80}$' then perform public.ttc_fail('invalid'); end if;
   select x.result into old from public.ttc_slot_plays x where member_id=member and idempotency_key=p_input->>'idempotencyKey';
   if old is not null then return old||'{"duplicate":true}'::jsonb; end if;
   if now()<'2026-10-24 14:00:00 America/Jamaica'::timestamptz then perform public.ttc_fail('not-open'); end if;
   if exists(select 1 from public.ttc_slot_plays where member_id=member and created_at>now()-interval '2 seconds') then perform public.ttc_fail('rate-limited'); end if;
   -- Trusted server supplies engine outcome; browser cannot call this RPC.
   if p_input->>'outcome' not in ('pair','miss','triple','jackpot') or jsonb_array_length(p_input->'stops')<>3 then perform public.ttc_fail('invalid'); end if;
   select count(*) into play_count from public.ttc_slot_plays where member_id=member;
   if (p_input->>'sequence')::integer<>play_count then perform public.ttc_fail('conflict'); end if;
   bonus := case when play_count=0 then 10 else 0 end;
   delta := bonus + case when play_count=0 then 0 when p_input->>'outcome'='pair' then 1 when p_input->>'outcome'='triple' then 3 when p_input->>'outcome'='jackpot' then 10 else 0 end;
   action_id := gen_random_uuid();
   update public.ttc_reward_balances set quantity=quantity+delta where member_id=member;
   if delta>0 then insert into public.ttc_reward_transactions(member_id,delta,reason,idempotency_key,fingerprint)
     values(member,delta,case when bonus>0 then 'slots.first-play' else 'slots.win' end,'slots:'||action_id,p_input); end if;
   result := jsonb_build_object('playId',action_id,'stops',p_input->'stops','outcome',p_input->>'outcome','granted',delta::text,'firstPlayBonus',bonus::text,'balance',public.ttc_balance_json(member),'duplicate',false);
   insert into public.ttc_slot_plays(id,member_id,idempotency_key,result) values(action_id,member,p_input->>'idempotencyKey',result);
   insert into public.ttc_activity_events(type,detail) values('casino.slots-played',jsonb_build_object('playId',action_id,'granted',delta::text));
   return result;
 elsif p_action='system-slots-context' then
   return jsonb_build_object('sequence',(select count(*) from public.ttc_slot_plays where member_id=p_actor),'jackpotPaid',exists(select 1 from public.ttc_slot_plays where member_id=p_actor and result->>'outcome'='jackpot'));
 elsif p_action='owner-overview' then
   return jsonb_build_object(
    'privileges',coalesce((select jsonb_agg(public.ttc_privilege_json(x,member) order by x.slug) from public.ttc_privileges x),'[]'),
    'redemptions',coalesce((select jsonb_agg(public.ttc_redemption_json(x)) from (select * from public.ttc_redemptions order by created_at desc limit 100) x),'[]'),
    'balances',jsonb_build_array(public.ttc_balance_json(member)),
    'messages',coalesce((select jsonb_agg(public.ttc_message_json(x)) from (select * from public.ttc_messages order by created_at desc limit 100) x),'[]'),
    'deliveries',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'messageId',x.message_id,'state',x.state,'providerSid',x.provider_sid,'error',x.error,'createdAt',x.created_at)) from (select * from public.ttc_message_delivery_logs order by created_at desc limit 100) x),'[]'),
    'activity',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'type',x.type,'detail',x.detail,'createdAt',x.created_at)) from (select * from public.ttc_activity_events order by created_at desc limit 100) x),'[]'));
 elsif p_action in ('owner-privilege-create','owner-privilege-update') then
   if p_action='owner-privilege-update' then
     select * into p from public.ttc_privileges where id=(p_input->>'id')::uuid for update;
     if p.id is null then perform public.ttc_fail('not-found'); end if;
     if p.slug<>p_input->>'slug' or p.kind<>p_input->>'kind' then perform public.ttc_fail('invalid'); end if;
   else p.id := gen_random_uuid(); end if;
   insert into public.ttc_privileges(id,slug,title,description,kind,enabled,opens_at,closes_at,min_amount_pence,max_amount_pence)
   values(p.id,p_input->>'slug',p_input->>'title',p_input->>'description',p_input->>'kind',(p_input->>'enabled')::boolean,(p_input->>'opensAt')::timestamptz,(p_input->>'closesAt')::timestamptz,(p_input->>'minAmountPence')::integer,(p_input->>'maxAmountPence')::integer)
   on conflict(id) do update set title=excluded.title,description=excluded.description,enabled=excluded.enabled,opens_at=excluded.opens_at,closes_at=excluded.closes_at,min_amount_pence=excluded.min_amount_pence,max_amount_pence=excluded.max_amount_pence returning * into p;
   insert into public.ttc_activity_events(type,detail) values('privilege.saved',jsonb_build_object('privilegeId',p.id));
   return jsonb_build_object('privilege',public.ttc_privilege_json(p,member));
 elsif p_action='owner-fulfil' then
   select * into r from public.ttc_redemptions where id=(p_input->>'id')::uuid for update;
   if r.id is null then perform public.ttc_fail('not-found'); end if;
   if r.state='pending' then
     update public.ttc_redemptions set state='fulfilled',fulfilled_at=now() where id=r.id returning * into r;
     insert into public.ttc_activity_events(type,detail) values('redemption.fulfilled',jsonb_build_object('redemptionId',r.id));
   end if;
   return jsonb_build_object('redemption',public.ttc_redemption_json(r));
 elsif p_action='owner-adjust' then
   perform 1 from public.ttc_members where id=member for update;
   if coalesce(p_input->>'delta','') !~ '^-?[1-9][0-9]*$' or length(p_input->>'delta')>1000
      or coalesce(p_input->>'idempotencyKey','') !~ '^[A-Za-z0-9_-]{8,80}$'
      or length(coalesce(p_input->>'reason','')) not between 3 and 280 then perform public.ttc_fail('invalid'); end if;
   fp := p_input-'idempotencyKey';
   select fingerprint into old from public.ttc_reward_transactions where member_id=member and idempotency_key=p_input->>'idempotencyKey';
   if old is not null then
     if old<>fp then perform public.ttc_fail('idempotency-conflict'); end if;
     return jsonb_build_object('balance',public.ttc_balance_json(member),'duplicate',true);
   end if;
   delta := (p_input->>'delta')::numeric;
   update public.ttc_reward_balances set quantity=quantity+delta where member_id=member and quantity+delta>=0;
   if not found then perform public.ttc_fail('insufficient-balance'); end if;
   insert into public.ttc_reward_transactions(member_id,delta,reason,idempotency_key,fingerprint) values(member,delta,p_input->>'reason',p_input->>'idempotencyKey',fp);
   insert into public.ttc_activity_events(type,detail) values('reward.adjusted',fp);
   return jsonb_build_object('balance',public.ttc_balance_json(member),'duplicate',false);
 elsif p_action in ('owner-message-create','owner-message-update','owner-message-approve','owner-message-cancel','owner-message-retry') then
   if p_action<>'owner-message-create' then
     select * into m from public.ttc_messages where id=(p_input->>'id')::uuid for update;
     if m.id is null then perform public.ttc_fail('not-found'); end if;
     if m.state in ('sending','accepted','delivered','uncertain') then perform public.ttc_fail('conflict'); end if;
   end if;
   if p_action in ('owner-message-create','owner-message-update') then
     if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_input->>'timezone') then perform public.ttc_fail('invalid'); end if;
     if p_action='owner-message-create' then
       insert into public.ttc_messages(label,body,category,send_at,timezone) values(p_input->>'label',p_input->>'body','scheduled-alise',(p_input->>'sendAt')::timestamptz,p_input->>'timezone') returning * into m;
     else
       if m.category<>'scheduled-alise' then perform public.ttc_fail('conflict'); end if;
       update public.ttc_messages set label=p_input->>'label',body=p_input->>'body',send_at=(p_input->>'sendAt')::timestamptz,timezone=p_input->>'timezone',state='draft',approved_at=null,next_attempt_at=null,last_error=null where id=m.id returning * into m;
     end if;
   elsif p_action in ('owner-message-approve','owner-message-retry') then
     if p_action='owner-message-retry' and (m.state<>'failed' or m.attempts>=5) then perform public.ttc_fail('conflict'); end if;
     if p_action='owner-message-approve' and m.state not in ('draft','approved') then perform public.ttc_fail('conflict'); end if;
     if m.send_at is null or (m.category='scheduled-alise' and m.send_at<=now() and p_action<>'owner-message-retry') then perform public.ttc_fail('invalid'); end if;
     if m.category='scheduled-alise' and m.send_at<now()-interval '30 minutes' then perform public.ttc_fail('expired'); end if;
     update public.ttc_messages set state='approved',approved_at=now(),next_attempt_at=now(),last_error=null where id=m.id returning * into m;
   else update public.ttc_messages set state='cancelled',approved_at=null where id=m.id returning * into m;
   end if;
   insert into public.ttc_activity_events(type,detail) values(p_action,jsonb_build_object('messageId',m.id));
   return jsonb_build_object('message',public.ttc_message_json(m));
 elsif p_action='system-message-claim' then
   -- A crashed/in-flight request may have reached Twilio. Hold it; never blind retry.
   with stale as (update public.ttc_messages set state='uncertain',last_error='Worker interrupted; reconcile with Twilio before any resend.' where state='sending' and claimed_at<now()-interval '2 minutes' returning id)
   insert into public.ttc_message_delivery_logs(message_id,state,error) select id,'uncertain','Worker interrupted' from stale;
   update public.ttc_messages set state='failed',last_error='Scheduled time missed; review and reschedule.',approved_at=null
     where category='scheduled-alise' and state='approved' and send_at<now()-interval '30 minutes';
   select * into m from public.ttc_messages where state='approved' and approved_at is not null and send_at<=now()
     and coalesce(next_attempt_at,send_at)<=now() and attempts<5 order by send_at limit 1 for update skip locked;
   if m.id is null then return 'null'::jsonb; end if;
   update public.ttc_messages set state='sending',claimed_at=now(),claim_id=gen_random_uuid(),attempts=attempts+1 where id=m.id returning * into m;
   insert into public.ttc_message_delivery_logs(message_id,state) values(m.id,'sending');
   return public.ttc_message_json(m)||jsonb_build_object('claimId',m.claim_id);
 elsif p_action='system-message-result' then
   select * into m from public.ttc_messages where id=(p_input->>'id')::uuid for update;
   if m.id is null or m.claim_id is distinct from (p_input->>'claimId')::uuid then perform public.ttc_fail('conflict'); end if;
   if m.state in ('delivered','failed') and m.provider_sid is not null then return '{"ok":true}'; end if;
   if m.state<>'sending' then perform public.ttc_fail('conflict'); end if;
   if p_input->>'state' not in ('accepted','failed','uncertain','approved') then perform public.ttc_fail('invalid'); end if;
   update public.ttc_messages set state=case when p_input->>'state'='approved' and attempts>=5 then 'failed' else p_input->>'state' end,
    provider_sid=p_input->>'providerSid',last_error=p_input->>'error',
    next_attempt_at=now()+make_interval(secs=>least(3600,30*(2^m.attempts)::integer)) where id=m.id returning * into m;
   insert into public.ttc_message_delivery_logs(message_id,state,provider_sid,error) values(m.id,m.state,m.provider_sid,m.last_error);
   return '{"ok":true}';
 elsif p_action='system-message-callback' then
   select * into m from public.ttc_messages where id=(p_input->>'id')::uuid for update;
   if m.id is null then perform public.ttc_fail('not-found'); end if;
   if m.state not in ('sending','accepted','delivered','uncertain','failed') or (m.provider_sid is not null and m.provider_sid<>p_input->>'providerSid') then perform public.ttc_fail('conflict'); end if;
   if m.state='delivered' then return '{"ok":true}'; end if;
   update public.ttc_messages set state=case when p_input->>'state'='delivered' then 'delivered' when p_input->>'state' in ('failed','undelivered','canceled') then 'failed' else 'accepted' end,
    provider_sid=p_input->>'providerSid',last_error=p_input->>'error' where id=m.id returning * into m;
   insert into public.ttc_message_delivery_logs(message_id,state,provider_sid,error) values(m.id,m.state,m.provider_sid,m.last_error);
   return '{"ok":true}';
 end if;
 perform public.ttc_fail('not-found'); return null;
end $$;

insert into public.ttc_members(slug,name) values('alise','Alise Khera');
insert into public.ttc_reward_balances(member_id) select id from public.ttc_members where slug='alise';
insert into public.ttc_privileges(slug,title,description,kind,opens_at,closes_at,min_amount_pence,max_amount_pence) values
 ('nail-appointment','Nail Appointment','Your pre-departure nail appointment, with the compliments of the club.','beauty','2026-10-01T00:00:00Z','2026-10-22T00:00:00+01:00',1,100000),
 ('brow-appointment','Brow Appointment','Your pre-departure brow appointment, with the compliments of the club.','beauty','2026-10-01T00:00:00Z','2026-10-22T00:00:00+01:00',1,100000),
 ('drink-vouchers','Drink Vouchers','Present your vouchers to the Butler.','drink','2026-10-24T14:00:00-05:00',null,null,null);
insert into public.ttc_messages(seed_key,label,body,category,send_at,timezone) values
 ('departure','Departure Lounge','Alise, your Departure Lounge is ready. https://30.ag14.co/departure','scheduled-alise','2026-10-22T14:00:00+01:00','Europe/London'),
 ('jamaica','Jamaica welcome','Welcome to Jamaica, Alise. Your club awaits. https://30.ag14.co','scheduled-alise',null,'America/Jamaica'),
 ('birthday','Birthday opening','Happy birthday, Alise. The Thirty Club is ready to welcome you. https://30.ag14.co','scheduled-alise','2026-10-24T00:00:00-05:00','America/Jamaica'),
 ('casino','Casino opening','Alise, the Grand Casino is now open. https://30.ag14.co','scheduled-alise','2026-10-24T14:00:00-05:00','America/Jamaica');

do $$ declare obj record; begin
 for obj in select tablename from pg_tables where schemaname='public' and tablename like 'ttc_%' loop
   execute format('alter table public.%I enable row level security',obj.tablename);
   execute format('revoke all on public.%I from public, anon, authenticated',obj.tablename);
   execute format('grant all on public.%I to service_role',obj.tablename);
 end loop;
 for obj in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'ttc_%' loop
   execute format('revoke all on function %s from public, anon, authenticated',obj.signature);
   execute format('grant execute on function %s to service_role',obj.signature);
 end loop;
end $$;
