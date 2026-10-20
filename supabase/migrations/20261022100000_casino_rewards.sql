-- Apply after 20261022090000_birthday_journey.sql. No existing prize,
-- privilege, slot-play, vault or live progress row is changed by this migration.
create table public.ttc_prize_catalogue (
 id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 1 and 100),
 description text not null default '' check(length(description)<=1000),
 presentation text not null default '' check(length(presentation)<=1000),
 kind text not null check(kind in ('VOUCHER','VAULT_GIFT')),
 image_url text check(image_url is null or length(image_url)<=500),
 instructions text not null default '' check(length(instructions)<=1000),
 valid_until timestamptz, active boolean not null default true,
 owner_notes text not null default '' check(length(owner_notes)<=2000),
 vault_id uuid references public.ttc_vaults(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check ((kind='VAULT_GIFT') = (vault_id is not null))
);
create table public.ttc_casino_batches (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.ttc_members(id),
 quantity integer not null check(quantity between 1 and 50), next_position integer not null default 1,
 status text not null default 'active' check(status in ('active','completed','cancelled')),
 idempotency_key text not null, fingerprint jsonb not null,
 created_at timestamptz not null default now(), completed_at timestamptz,
 unique(member_id,idempotency_key), check(next_position between 1 and quantity+1)
);
create table public.ttc_casino_allocations (
 batch_id uuid not null references public.ttc_casino_batches(id), position integer not null check(position>=1),
 prize_id uuid not null references public.ttc_prize_catalogue(id), snapshot jsonb not null,
 primary key(batch_id,position)
);
create table public.ttc_casino_spins (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.ttc_members(id),
 batch_id uuid not null references public.ttc_casino_batches(id), position integer not null,
 idempotency_key text not null, prize_snapshot jsonb, created_at timestamptz not null default now(),
 unique(batch_id,position), unique(member_id,idempotency_key)
);
create table public.ttc_reward_entitlements (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.ttc_members(id),
 spin_id uuid not null unique references public.ttc_casino_spins(id),
 batch_id uuid not null references public.ttc_casino_batches(id), prize_id uuid not null references public.ttc_prize_catalogue(id),
 snapshot jsonb not null, kind text not null check(kind in ('VOUCHER','VAULT_GIFT')),
 state text not null check(state in ('AVAILABLE','REQUESTED','FULFILLED','UNLOCKED','REVEALED')),
 vault_id uuid references public.ttc_vaults(id), created_at timestamptz not null default now(),
 fulfilled_at timestamptz, revealed_at timestamptz,
 check ((kind='VOUCHER' and state in ('AVAILABLE','REQUESTED','FULFILLED') and vault_id is null)
    or (kind='VAULT_GIFT' and state in ('UNLOCKED','REVEALED','FULFILLED') and vault_id is not null))
);
create table public.ttc_voucher_requests (
 id uuid primary key default gen_random_uuid(), entitlement_id uuid not null references public.ttc_reward_entitlements(id),
 state text not null default 'REQUESTED' check(state in ('REQUESTED','FULFILLED','CANCELLED')),
 requested_at timestamptz not null default now(), fulfilled_at timestamptz, cancelled_at timestamptz
);
create unique index ttc_voucher_one_active on public.ttc_voucher_requests(entitlement_id) where state<>'CANCELLED';
create index ttc_casino_batch_member on public.ttc_casino_batches(member_id,created_at);
create index ttc_reward_member on public.ttc_reward_entitlements(member_id,created_at);

create function public.ttc_casino_prize_snapshot(p public.ttc_prize_catalogue) returns jsonb
language sql stable set search_path='' as $$ select jsonb_build_object(
 'prizeId',p.id,'title',p.title,'description',p.description,'presentation',p.presentation,
 'kind',p.kind,'imageUrl',p.image_url,'instructions',p.instructions,
 'validUntil',p.valid_until,'vaultId',p.vault_id) $$;

create function public.ttc_casino_entitlement_json(e public.ttc_reward_entitlements) returns jsonb
language sql stable set search_path='' as $$ select jsonb_build_object(
 'id',e.id,'batchId',e.batch_id,'spinId',e.spin_id,'prize',e.snapshot,'kind',e.kind,
 'state',e.state,'vaultId',e.vault_id,'createdAt',e.created_at,'fulfilledAt',e.fulfilled_at,
 'revealedAt',e.revealed_at) $$;

-- The member row serialises every play, including requests from multiple tabs.
-- The idempotency lookup occurs after that lock and before any availability check.
create function public.ttc_casino_issue(p_member uuid,p_input jsonb,p_key text) returns jsonb
language plpgsql set search_path='' as $$
declare b public.ttc_casino_batches; ids jsonb; n integer; i integer; x uuid; p public.ttc_prize_catalogue;
        snap jsonb; fp jsonb; chosen integer[] := '{}'; slot integer; tries integer;
begin
 if to_regprocedure('public.ttc_journey_publish(text,text,text,jsonb)') is null then
   perform public.ttc_fail('not-configured');
 end if;
 n := nullif(p_input->>'quantity','')::integer; ids := coalesce(p_input->'prizeIds','[]'::jsonb);
 if n is null or n not between 1 and 50 or jsonb_typeof(ids)<>'array' or jsonb_array_length(ids)>n
    or coalesce(p_key,'') !~ '^[A-Za-z0-9:_.-]{8,120}$' then perform public.ttc_fail('invalid'); end if;
 fp := jsonb_build_object('quantity',n,'prizeIds',ids,'announce',coalesce((p_input->>'announce')::boolean,true));
 perform 1 from public.ttc_members where id=p_member for update;
 select * into b from public.ttc_casino_batches where member_id=p_member and idempotency_key=p_key;
 if b.id is not null then
   if b.fingerprint<>fp then perform public.ttc_fail('idempotency-conflict'); end if;
   return jsonb_build_object('batchId',b.id,'quantity',b.quantity,'remaining',b.quantity-b.next_position+1,'status',b.status,'duplicate',true);
 end if;
 -- Validate every selected prize before inserting anything. Repeated catalogue
 -- ids are allowed: each occurrence is one separate guaranteed prize.
 for i in 0..jsonb_array_length(ids)-1 loop
   select * into p from public.ttc_prize_catalogue where id=(ids->>i)::uuid and active;
   if p.id is null then perform public.ttc_fail('not-found'); end if;
   if p.kind='VAULT_GIFT' and not exists(select 1 from public.ttc_vaults v where v.id=p.vault_id and v.trigger='casino' and v.state='locked') then
     perform public.ttc_fail('invalid'); end if;
 end loop;
 insert into public.ttc_casino_batches(member_id,quantity,idempotency_key,fingerprint)
 values(p_member,n,p_key,fp) returning * into b;
 for i in 0..jsonb_array_length(ids)-1 loop
   x := (ids->>i)::uuid;
   select * into p from public.ttc_prize_catalogue where id=x;
   if p.kind='VAULT_GIFT' and exists(
     select 1 from public.ttc_casino_allocations used
       join public.ttc_casino_batches other on other.id=used.batch_id
       where used.snapshot->>'vaultId'=p.vault_id::text and other.status<>'cancelled'
   ) then perform public.ttc_fail('conflict'); end if;
   snap := public.ttc_casino_prize_snapshot(p);
   -- Uniformly pick one of the still-free positions; random() is server-side.
   tries := 0;
   loop
     slot := 1+floor(random()*n)::integer;
     exit when not slot=any(chosen);
     tries := tries+1;
     if tries>200 then select s into slot from generate_series(1,n) s where not s=any(chosen) order by random() limit 1; exit; end if;
   end loop;
   chosen := array_append(chosen,slot);
   insert into public.ttc_casino_allocations(batch_id,position,prize_id,snapshot) values(b.id,slot,x,snap);
 end loop;
 perform public.ttc_journey_publish('casino.spins.issued','casino','spins-batch-'||b.id,
   jsonb_build_object('batchId',b.id,'quantity',n,'announce',coalesce((p_input->>'announce')::boolean,true)));
 insert into public.ttc_activity_events(type,detail) values('casino.spins.issued',jsonb_build_object('batchId',b.id,'quantity',n,'prizes',jsonb_array_length(ids)));
 return jsonb_build_object('batchId',b.id,'quantity',n,'remaining',n,'status','active','duplicate',false);
end $$;

create function public.ttc_casino_action(p_actor uuid,p_role text,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql set search_path='' as $$
declare m uuid; b public.ttc_casino_batches; s public.ttc_casino_spins; a public.ttc_casino_allocations;
        p public.ttc_prize_catalogue; e public.ttc_reward_entitlements; r public.ttc_voucher_requests;
        k text; result jsonb; n integer; available integer;
begin
 select id into m from public.ttc_members where slug='alise' and enabled;
 if m is null then perform public.ttc_fail('not-configured'); end if;
 if p_role='member' and p_actor is distinct from m then perform public.ttc_fail('forbidden'); end if;
 if p_role not in ('member','owner') then perform public.ttc_fail('forbidden'); end if;
 if p_action like 'owner-%' and p_role<>'owner' then perform public.ttc_fail('forbidden'); end if;
 if p_action not like 'owner-%' and p_role<>'member' then perform public.ttc_fail('forbidden'); end if;

 if p_action='owner-casino-prizes' then
   return jsonb_build_object('prizes',coalesce((select jsonb_agg(jsonb_build_object(
     'id',x.id,'title',x.title,'description',x.description,'presentation',x.presentation,
     'kind',x.kind,'imageUrl',x.image_url,'instructions',x.instructions,'validUntil',x.valid_until,
     'active',x.active,'ownerNotes',x.owner_notes,'vaultId',x.vault_id) order by x.created_at)
     from public.ttc_prize_catalogue x),'[]'::jsonb));
 elsif p_action in ('owner-casino-prize-create','owner-casino-prize-update') then
   if length(trim(coalesce(p_input->>'title',''))) not between 1 and 100 or p_input->>'kind' not in ('VOUCHER','VAULT_GIFT')
      or length(coalesce(p_input->>'description',''))>1000 or length(coalesce(p_input->>'presentation',''))>1000
      or length(coalesce(p_input->>'instructions',''))>1000 or length(coalesce(p_input->>'ownerNotes',''))>2000
      or length(coalesce(p_input->>'imageUrl',''))>500 or jsonb_typeof(p_input->'active')<>'boolean'
      or ((p_input->>'kind'='VAULT_GIFT') is distinct from (p_input->>'vaultId' is not null)) then
      perform public.ttc_fail('invalid'); end if;
   if p_input->>'kind'='VAULT_GIFT' and not exists(select 1 from public.ttc_vaults where id=(p_input->>'vaultId')::uuid and trigger='casino') then perform public.ttc_fail('invalid'); end if;
   if p_action='owner-casino-prize-create' then
     insert into public.ttc_prize_catalogue(title,description,presentation,kind,image_url,instructions,valid_until,active,owner_notes,vault_id)
     values(trim(p_input->>'title'),coalesce(p_input->>'description',''),coalesce(p_input->>'presentation',''),p_input->>'kind',
       p_input->>'imageUrl',coalesce(p_input->>'instructions',''),(p_input->>'validUntil')::timestamptz,(p_input->>'active')::boolean,
       coalesce(p_input->>'ownerNotes',''),(p_input->>'vaultId')::uuid) returning * into p;
   else
     select * into p from public.ttc_prize_catalogue where id=(p_input->>'id')::uuid for update;
     if p.id is null then perform public.ttc_fail('not-found'); end if;
     update public.ttc_prize_catalogue set title=trim(p_input->>'title'),description=coalesce(p_input->>'description',''),
       presentation=coalesce(p_input->>'presentation',''),kind=p_input->>'kind',image_url=p_input->>'imageUrl',
       instructions=coalesce(p_input->>'instructions',''),valid_until=(p_input->>'validUntil')::timestamptz,
       active=(p_input->>'active')::boolean,owner_notes=coalesce(p_input->>'ownerNotes',''),
       vault_id=(p_input->>'vaultId')::uuid,updated_at=now() where id=p.id returning * into p;
   end if;
   insert into public.ttc_activity_events(type,detail) values('casino.prize.saved',jsonb_build_object('prizeId',p.id));
   return jsonb_build_object('prize',jsonb_build_object('id',p.id,'title',p.title,'kind',p.kind,'active',p.active));
 elsif p_action='owner-casino-issue' then
   return public.ttc_casino_issue(m,p_input,p_input->>'idempotencyKey');
 elsif p_action='owner-casino-batches' then
   return jsonb_build_object('batches',coalesce((select jsonb_agg(jsonb_build_object(
      'id',x.id,'quantity',x.quantity,'remaining',x.quantity-x.next_position+1,'status',x.status,
      'createdAt',x.created_at,'completedAt',x.completed_at,
      'allocations',(select coalesce(jsonb_agg(jsonb_build_object('position',z.position,'prize',z.snapshot) order by z.position),'[]'::jsonb)
        from public.ttc_casino_allocations z where z.batch_id=x.id),
      'spins',(select coalesce(jsonb_agg(jsonb_build_object('id',y.id,'position',y.position,'prize',y.prize_snapshot,'createdAt',y.created_at) order by y.position),'[]'::jsonb)
        from public.ttc_casino_spins y where y.batch_id=x.id)) order by x.created_at desc)
      from public.ttc_casino_batches x),'[]'::jsonb));
 elsif p_action='owner-casino-cancel' then
   select * into b from public.ttc_casino_batches where id=(p_input->>'id')::uuid for update;
   if b.id is null then perform public.ttc_fail('not-found'); end if;
   if b.status<>'active' or b.next_position<>1 then perform public.ttc_fail('conflict'); end if;
   update public.ttc_casino_batches set status='cancelled',completed_at=now() where id=b.id;
   -- An announcement not yet delivered is withdrawn: the Butler never
   -- promises spins that were cancelled. One already delivered is reported
   -- back so the owner can write to her (it is never recalled silently).
   update public.ttc_journey_events set state='recorded', processed_at=now(),
       last_error='Batch cancelled before the announcement was delivered.'
     where source='casino' and idempotency_key='spins-batch-'||b.id and state in ('pending','deferred','failed');
   insert into public.ttc_activity_events(type,detail) values('casino.batch.cancelled',jsonb_build_object('batchId',b.id));
   return jsonb_build_object('batchId',b.id,'status','cancelled',
     'announcementDelivered', exists(select 1 from public.ttc_journey_events
        where source='casino' and idempotency_key='spins-batch-'||b.id and state='processed'));
 elsif p_action='casino-status' then
   select coalesce(sum(quantity-next_position+1),0)::integer into available from public.ttc_casino_batches where member_id=m and status='active';
   return jsonb_build_object('available',available,'spins',coalesce((select jsonb_agg(jsonb_build_object(
     'id',x.id,'batchId',x.batch_id,'position',x.position,'prize',x.prize_snapshot,'idempotencyKey',x.idempotency_key,
     'entitlementId',e2.id,'createdAt',x.created_at) order by x.created_at desc)
     from public.ttc_casino_spins x left join public.ttc_reward_entitlements e2 on e2.spin_id=x.id where x.member_id=m),'[]'::jsonb));
 elsif p_action='casino-spin' then
   if to_regprocedure('public.ttc_room_admitted(uuid,text)') is null then perform public.ttc_fail('not-configured'); end if;
   if not public.ttc_room_admitted(m,'casino') then perform public.ttc_fail('not-open'); end if;
   k := p_input->>'idempotencyKey';
   if k is null or k !~ '^[A-Za-z0-9_-]{8,80}$' then perform public.ttc_fail('invalid'); end if;
   perform 1 from public.ttc_members where id=m for update;
   select * into s from public.ttc_casino_spins where member_id=m and idempotency_key=k;
   if s.id is not null then
     select * into e from public.ttc_reward_entitlements where spin_id=s.id;
     return jsonb_build_object('id',s.id,'batchId',s.batch_id,'position',s.position,'prize',s.prize_snapshot,
       'entitlementId',e.id,'duplicate',true);
   end if;
   select * into b from public.ttc_casino_batches where member_id=m and status='active' order by created_at,id limit 1 for update;
   if b.id is null then perform public.ttc_fail('not-open'); end if;
   select * into a from public.ttc_casino_allocations where batch_id=b.id and position=b.next_position;
   insert into public.ttc_casino_spins(member_id,batch_id,position,idempotency_key,prize_snapshot)
   values(m,b.id,b.next_position,k,a.snapshot) returning * into s;
   update public.ttc_casino_batches set next_position=next_position+1,
     status=case when next_position=quantity then 'completed' else 'active' end,
     completed_at=case when next_position=quantity then now() else null end where id=b.id;
   if a.prize_id is not null then
     insert into public.ttc_reward_entitlements(member_id,spin_id,batch_id,prize_id,snapshot,kind,state,vault_id)
     values(m,s.id,b.id,a.prize_id,a.snapshot,a.snapshot->>'kind',
       case when a.snapshot->>'kind'='VOUCHER' then 'AVAILABLE' else 'UNLOCKED' end,
       (a.snapshot->>'vaultId')::uuid) returning * into e;
     perform public.ttc_journey_publish('casino.prize.awarded','casino','prize-spin-'||s.id,
       jsonb_build_object('prizeId',e.id,'title',e.snapshot->>'title','announce',false));
     if e.kind='VOUCHER' then
       perform public.ttc_journey_publish('reward.voucher.issued','casino','voucher-'||e.id,
         jsonb_build_object('voucherId',e.id,'title',e.snapshot->>'title'));
     else
       -- The existing NFC/code gate remains authoritative; only the selected
       -- casino-linked compartment becomes READY on this entitled award.
       update public.ttc_vaults set state='ready',ready_at=now(),updated_at=now()
         where id=e.vault_id and state='locked' and trigger='casino';
       perform public.ttc_journey_publish('vault.gift.unlocked','casino','vault-gift-'||e.id,
         jsonb_build_object('vaultId',e.vault_id,'title',e.snapshot->>'title'));
     end if;
     insert into public.ttc_activity_events(type,detail) values('casino.prize.awarded',jsonb_build_object('spinId',s.id,'entitlementId',e.id));
   end if;
   insert into public.ttc_activity_events(type,detail) values('casino.spin',jsonb_build_object('spinId',s.id,'batchId',b.id,'position',s.position));
   return jsonb_build_object('id',s.id,'batchId',b.id,'position',s.position,'prize',s.prize_snapshot,
     'entitlementId',e.id,'duplicate',false);
 elsif p_action in ('voucher-list','owner-voucher-list') then
   -- Opening the existing NFC/code compartment reveals the digital gift;
   -- physical fulfilment remains a separate owner action.
   update public.ttc_reward_entitlements x set state='REVEALED',revealed_at=v.opened_at
     from public.ttc_vaults v where x.vault_id=v.id and x.kind='VAULT_GIFT'
       and x.state='UNLOCKED' and v.state='opened';
   return jsonb_build_object('entitlements',coalesce((select jsonb_agg(public.ttc_casino_entitlement_json(x) order by x.created_at desc)
     from public.ttc_reward_entitlements x where p_role='owner' or x.member_id=m),'[]'::jsonb),
     'requests',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'entitlementId',q.entitlement_id,
       'state',q.state,'requestedAt',q.requested_at,'fulfilledAt',q.fulfilled_at,'cancelledAt',q.cancelled_at) order by q.requested_at desc)
       from public.ttc_voucher_requests q join public.ttc_reward_entitlements x on x.id=q.entitlement_id
       where p_role='owner' or x.member_id=m),'[]'::jsonb));
 elsif p_action='voucher-request' then
   perform 1 from public.ttc_members where id=m for update;
   select * into e from public.ttc_reward_entitlements where id=(p_input->>'id')::uuid and member_id=m for update;
   if e.id is null then perform public.ttc_fail('not-found'); end if;
   if e.kind<>'VOUCHER' then perform public.ttc_fail('invalid'); end if;
   if e.state='FULFILLED' then perform public.ttc_fail('already-redeemed'); end if;
   if e.snapshot->>'validUntil' is not null and now()>(e.snapshot->>'validUntil')::timestamptz then
     perform public.ttc_fail('expired'); end if;
   select * into r from public.ttc_voucher_requests where entitlement_id=e.id and state='REQUESTED';
   if r.id is not null then return jsonb_build_object('requestId',r.id,'state',r.state,'duplicate',true); end if;
   if e.state<>'AVAILABLE' then perform public.ttc_fail('conflict'); end if;
   insert into public.ttc_voucher_requests(entitlement_id) values(e.id) returning * into r;
   update public.ttc_reward_entitlements set state='REQUESTED' where id=e.id;
   perform public.ttc_journey_publish('reward.voucher.redemption_requested','casino','voucher-request-'||r.id,
     jsonb_build_object('voucherId',e.id,'redemptionId',r.id,'title',e.snapshot->>'title'));
   insert into public.ttc_activity_events(type,detail) values('reward.voucher.requested',jsonb_build_object('entitlementId',e.id,'requestId',r.id));
   return jsonb_build_object('requestId',r.id,'state','REQUESTED','duplicate',false);
 elsif p_action in ('owner-voucher-fulfil','owner-voucher-cancel') then
   select * into r from public.ttc_voucher_requests where id=(p_input->>'id')::uuid for update;
   if r.id is null then perform public.ttc_fail('not-found'); end if;
   select * into e from public.ttc_reward_entitlements where id=r.entitlement_id for update;
   if r.state='FULFILLED' and p_action='owner-voucher-fulfil' then return jsonb_build_object('requestId',r.id,'state',r.state,'duplicate',true); end if;
   if r.state<>'REQUESTED' then perform public.ttc_fail('conflict'); end if;
   if p_action='owner-voucher-cancel' then
     update public.ttc_voucher_requests set state='CANCELLED',cancelled_at=now() where id=r.id;
     update public.ttc_reward_entitlements set state='AVAILABLE' where id=e.id;
     insert into public.ttc_activity_events(type,detail) values('reward.voucher.cancelled',jsonb_build_object('requestId',r.id));
     return jsonb_build_object('requestId',r.id,'state','CANCELLED','duplicate',false);
   end if;
   update public.ttc_voucher_requests set state='FULFILLED',fulfilled_at=now() where id=r.id;
   update public.ttc_reward_entitlements set state='FULFILLED',fulfilled_at=now() where id=e.id;
   perform public.ttc_journey_publish('reward.voucher.fulfilled','casino','voucher-fulfilled-'||r.id,
     jsonb_build_object('voucherId',e.id,'redemptionId',r.id,'title',e.snapshot->>'title'));
   insert into public.ttc_activity_events(type,detail) values('reward.voucher.fulfilled',jsonb_build_object('entitlementId',e.id,'requestId',r.id));
   return jsonb_build_object('requestId',r.id,'state','FULFILLED','duplicate',false);
 elsif p_action='owner-casino-gift-fulfil' then
   select * into e from public.ttc_reward_entitlements where id=(p_input->>'id')::uuid for update;
   if e.id is null then perform public.ttc_fail('not-found'); end if;
   if e.kind<>'VAULT_GIFT' then perform public.ttc_fail('invalid'); end if;
   if e.state='FULFILLED' then return jsonb_build_object('entitlementId',e.id,'state',e.state,'duplicate',true); end if;
   if e.state<>'REVEALED' then perform public.ttc_fail('conflict'); end if;
   update public.ttc_reward_entitlements set state='FULFILLED',fulfilled_at=now() where id=e.id;
   insert into public.ttc_activity_events(type,detail) values('vault.gift.fulfilled',jsonb_build_object('entitlementId',e.id,'vaultId',e.vault_id));
   return jsonb_build_object('entitlementId',e.id,'state','FULFILLED','duplicate',false);
 end if;
 perform public.ttc_fail('not-found'); return null;
end $$;

-- Stable milestone idempotency key is supplied by the journey, not the client.
create function public.ttc_journey_hook(p_name text,p_params jsonb,p_idempotency_key text) returns jsonb
language plpgsql set search_path='' as $$
declare m uuid;
begin
 if p_name<>'casino.spins.issue' then perform public.ttc_fail('not-found'); end if;
 select id into m from public.ttc_members where slug='alise' and enabled;
 if m is null then perform public.ttc_fail('not-configured'); end if;
 return public.ttc_casino_issue(m,p_params,p_idempotency_key);
end $$;

do $$ declare x record; begin
 for x in select c.oid::regclass as tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname in ('ttc_prize_catalogue','ttc_casino_batches','ttc_casino_allocations','ttc_casino_spins','ttc_reward_entitlements','ttc_voucher_requests') loop
   execute format('alter table %s enable row level security',x.tbl);
   execute format('revoke all on %s from public,anon,authenticated',x.tbl);
   execute format('grant all on %s to service_role',x.tbl);
   execute format('create policy service_only on %s for all to service_role using (true) with check (true)',x.tbl);
 end loop;
end $$;
do $$ declare x record; begin
 for x in select p.oid::regprocedure as fn from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and (p.proname like 'ttc_casino%' or p.proname='ttc_journey_hook') loop
   execute format('revoke all on function %s from public,anon,authenticated',x.fn);
   execute format('grant execute on function %s to service_role',x.fn);
 end loop;
end $$;
