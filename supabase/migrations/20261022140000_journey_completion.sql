-- The holiday journey, completed (ADR-024). Requires, in order, the five
-- release migrations 20261022090000 … 20261022130000.
--
-- Additive. Existing functions are wrapped (originals renamed, as ADR-021 and
-- ADR-023 did) except ttc_casino_issue and ttc_casino_prize_snapshot, which are
-- replaced with supersets of their audited bodies (same signature, same
-- behaviour when the new inputs are absent).
--
-- 1. Drinks privileges. Two separate balances: TWO airport drinks (her husband
--    pays) and THREE Jamaica "Bring Me a Drink" vouchers (all-inclusive; the
--    privilege is the delivery). A request records her beverage, deducts one
--    from that balance and queues an SMS to the owner in the same transaction.
--    No fulfilment step exists; the owner can add or restore either kind.
-- 2. Casino: a selected prize can be placed at an exact spin (the third spin);
--    prizes can be referenced by slug in milestone hooks; a prize can grant
--    drinks (claimed explicitly by her, never credited before) or carry a film
--    (replayable).
-- 3. Gift Vault: a compartment can open before the birthday (opens_at).
-- 4. REHEARSAL mode routes the owner's own notifications to the test number.
-- 5. Held milestones for 22-25 October with PROPOSED wording.

/* ---------- 1. Drinks privileges ---------- */

create table public.ttc_drink_grants (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.ttc_members(id),
  kind text not null check (kind in ('airport','jamaica')),
  quantity integer not null check (quantity between 1 and 10),
  source text not null check (source in ('owner','milestone','casino-claim')),
  source_ref text not null check (source_ref ~ '^[A-Za-z0-9:_.-]{3,160}$'),
  note text not null default '' check (length(note) <= 300),
  created_at timestamptz not null default now(),
  unique (member_id, source_ref)
);
create table public.ttc_drink_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.ttc_members(id),
  kind text not null check (kind in ('airport','jamaica')),
  beverage text not null check (length(btrim(beverage)) between 1 and 300),
  idempotency_key text not null,
  message_id uuid references public.ttc_messages(id),
  created_at timestamptz not null default now(),
  unique (member_id, idempotency_key)
);
create index ttc_drink_requests_member on public.ttc_drink_requests(member_id, created_at);

create function public.ttc_drinks_balance(p_member uuid, p_kind text) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object('granted', g.n, 'used', u.n, 'available', greatest(g.n - u.n, 0))
 from (select coalesce(sum(quantity),0)::integer n from public.ttc_drink_grants where member_id = p_member and kind = p_kind) g,
      (select count(*)::integer n from public.ttc_drink_requests where member_id = p_member and kind = p_kind) u
$$;

-- Her view of the notification: never the owner's numbers or errors.
create function public.ttc_drink_notice(p_message uuid) returns text
language sql stable set search_path = '' as $$
 select case
   when m.id is null then 'pending'
   when m.state in ('accepted','delivered') then 'sent'
   when m.state in ('failed','uncertain','cancelled') then 'delayed'
   else 'pending' end
 from (select 1) one left join public.ttc_messages m on m.id = p_message
$$;

create function public.ttc_drink_grant(p_member uuid, p_kind text, p_quantity integer, p_source text,
  p_ref text, p_note text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare g public.ttc_drink_grants;
begin
 if p_kind not in ('airport','jamaica') or p_quantity is null or p_quantity not between 1 and 10 then
   perform public.ttc_fail('invalid'); end if;
 insert into public.ttc_drink_grants(member_id, kind, quantity, source, source_ref, note)
   values (p_member, p_kind, p_quantity, p_source, p_ref, left(coalesce(p_note,''), 300))
   on conflict (member_id, source_ref) do nothing returning * into g;
 if g.id is null then
   select * into g from public.ttc_drink_grants where member_id = p_member and source_ref = p_ref;
   if g.kind <> p_kind or g.quantity <> p_quantity then perform public.ttc_fail('idempotency-conflict'); end if;
   return jsonb_build_object('grantId', g.id, 'duplicate', true);
 end if;
 insert into public.ttc_activity_events(type, detail) values ('drinks.granted',
   jsonb_build_object('kind', p_kind, 'quantity', p_quantity, 'source', p_source));
 return jsonb_build_object('grantId', g.id, 'duplicate', false);
end $$;

create function public.ttc_drinks_action(p_actor uuid, p_role text, p_action text, p_input jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare member uuid; r public.ttc_drink_requests; v_kind text; v_bal jsonb; v_body text; mid uuid;
  recent integer; result jsonb;
begin
 select id into member from public.ttc_members where slug = 'alise' and enabled;
 if member is null then perform public.ttc_fail('not-configured'); end if;
 if p_role is null or p_role not in ('owner','member') then perform public.ttc_fail('forbidden'); end if;
 if p_role = 'member' and p_actor is distinct from member then perform public.ttc_fail('forbidden'); end if;
 if p_action like 'owner-%' and p_role <> 'owner' then perform public.ttc_fail('forbidden'); end if;
 if p_action not like 'owner-%' and p_role <> 'member' then perform public.ttc_fail('forbidden'); end if;

 if p_action in ('drinks-status','owner-drinks') then
   result := jsonb_build_object(
     'airport', public.ttc_drinks_balance(member, 'airport'),
     'jamaica', public.ttc_drinks_balance(member, 'jamaica'),
     'requests', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'beverage', x.beverage,
         'createdAt', x.created_at, 'notice', public.ttc_drink_notice(x.message_id))
         || case when p_role = 'owner' then jsonb_build_object('message',
              (select jsonb_build_object('id', m.id, 'state', m.state, 'status', public.ttc_sms_status(m),
                 'lastError', m.last_error, 'attempts', m.attempts, 'body', m.body)
               from public.ttc_messages m where m.id = x.message_id)) else '{}'::jsonb end
       order by x.created_at desc) from public.ttc_drink_requests x where x.member_id = member), '[]'::jsonb),
     -- Prizes that grant drinks and are still waiting for her CLAIM.
     'unclaimed', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.snapshot->>'title',
         'kind', e.snapshot->>'drinksKind', 'quantity', (e.snapshot->>'drinksQuantity')::integer,
         'presentation', e.snapshot->>'presentation', 'createdAt', e.created_at) order by e.created_at)
       from public.ttc_reward_entitlements e
       where e.member_id = member and e.kind = 'VOUCHER' and e.state = 'AVAILABLE'
         and e.snapshot->>'drinksKind' is not null), '[]'::jsonb));
   if p_role = 'owner' then
     result := result || jsonb_build_object('grants', coalesce((select jsonb_agg(jsonb_build_object('id', g.id,
         'kind', g.kind, 'quantity', g.quantity, 'source', g.source, 'note', g.note, 'createdAt', g.created_at)
         order by g.created_at desc) from public.ttc_drink_grants g where g.member_id = member), '[]'::jsonb));
   end if;
   return result;

 elsif p_action = 'drinks-request' then
   v_kind := p_input->>'kind';
   if v_kind not in ('airport','jamaica') or length(btrim(coalesce(p_input->>'beverage',''))) not between 1 and 300
      or coalesce(p_input->>'idempotencyKey','') !~ '^[A-Za-z0-9_-]{8,80}$' then perform public.ttc_fail('invalid'); end if;
   -- One request at a time per member: the balance cannot be raced.
   perform 1 from public.ttc_members where id = member for update;
   select * into r from public.ttc_drink_requests where member_id = member and idempotency_key = p_input->>'idempotencyKey';
   if r.id is not null then
     if r.kind <> v_kind or r.beverage <> btrim(p_input->>'beverage') then perform public.ttc_fail('idempotency-conflict'); end if;
     return jsonb_build_object('request', jsonb_build_object('id', r.id, 'kind', r.kind, 'beverage', r.beverage,
       'createdAt', r.created_at, 'notice', public.ttc_drink_notice(r.message_id)),
       'balance', public.ttc_drinks_balance(member, v_kind), 'duplicate', true);
   end if;
   select count(*) into recent from public.ttc_drink_requests where member_id = member and created_at > now() - interval '10 minutes';
   if recent >= 4 then perform public.ttc_fail('rate-limited'); end if;
   v_bal := public.ttc_drinks_balance(member, v_kind);
   if (v_bal->>'available')::integer < 1 then perform public.ttc_fail('insufficient-balance'); end if;
   v_body := coalesce(p_input->>'notification','');
   if position('{beverage}' in v_body) = 0 then perform public.ttc_fail('not-configured'); end if;
   v_body := replace(replace(replace(v_body, '{beverage}', btrim(p_input->>'beverage')),
     '{remaining}', ((v_bal->>'available')::integer - 1)::text), '{granted}', (v_bal->>'granted'));
   -- The owner's SMS is queued in the same transaction: a recorded request
   -- always has its notification (sent while SMS operations allow).
   insert into public.ttc_messages(label, body, category, send_at, timezone, state, approved_at, next_attempt_at)
     values (case when v_kind = 'airport' then 'Airport drink request' else 'Bring Me a Drink request' end,
       left(v_body, 1600), 'correspondence-arron', now(), 'Europe/London', 'approved', now(), now())
     returning id into mid;
   insert into public.ttc_drink_requests(member_id, kind, beverage, idempotency_key, message_id)
     values (member, v_kind, btrim(p_input->>'beverage'), p_input->>'idempotencyKey', mid) returning * into r;
   -- Activity records that a request exists, never her words.
   insert into public.ttc_activity_events(type, detail) values ('drinks.requested',
     jsonb_build_object('requestId', r.id, 'kind', v_kind, 'messageId', mid));
   return jsonb_build_object('request', jsonb_build_object('id', r.id, 'kind', r.kind, 'beverage', r.beverage,
     'createdAt', r.created_at, 'notice', 'pending'),
     'balance', public.ttc_drinks_balance(member, v_kind), 'duplicate', false);

 elsif p_action = 'owner-drinks-grant' then
   if coalesce(p_input->>'idempotencyKey','') !~ '^[A-Za-z0-9_-]{8,80}$' then perform public.ttc_fail('invalid'); end if;
   perform 1 from public.ttc_members where id = member for update;
   result := public.ttc_drink_grant(member, p_input->>'kind', nullif(p_input->>'quantity','')::integer, 'owner',
     'owner:' || (p_input->>'idempotencyKey'), p_input->>'note');
   return result || jsonb_build_object('balance', public.ttc_drinks_balance(member, p_input->>'kind'));
 end if;
 perform public.ttc_fail('not-found'); return null;
end $$;

/* ---------- 2. Casino: exact positions, slugs, drinks and films ---------- */

alter table public.ttc_prize_catalogue
  add column slug text unique check (slug is null or slug ~ '^[a-z0-9-]{3,60}$'),
  add column drinks_kind text check (drinks_kind is null or drinks_kind in ('airport','jamaica')),
  add column drinks_quantity integer check (drinks_quantity is null or drinks_quantity between 1 and 10),
  add column video_url text check (video_url is null or (length(video_url) <= 500 and (video_url like '/%' or video_url like 'https://%'))),
  add constraint ttc_prize_drinks_pair check ((drinks_kind is null) = (drinks_quantity is null)),
  add constraint ttc_prize_extras_voucher check (kind = 'VOUCHER' or (drinks_kind is null and video_url is null));

-- Superset of the audited snapshot: the three new fields are added.
create or replace function public.ttc_casino_prize_snapshot(p public.ttc_prize_catalogue) returns jsonb
language sql stable set search_path='' as $$ select jsonb_build_object(
 'prizeId',p.id,'title',p.title,'description',p.description,'presentation',p.presentation,
 'kind',p.kind,'imageUrl',p.image_url,'instructions',p.instructions,
 'validUntil',p.valid_until,'vaultId',p.vault_id,
 'slug',p.slug,'drinksKind',p.drinks_kind,'drinksQuantity',p.drinks_quantity,'videoUrl',p.video_url) $$;

-- Superset of the audited issue: optional `prizePositions` (one per selected
-- prize, distinct, 1..quantity) places a prize on an exact spin — the third
-- spin's prize is then on the third spin whatever happens in between. Without
-- it, positions are random exactly as before, and the fingerprint is the same.
create or replace function public.ttc_casino_issue(p_member uuid,p_input jsonb,p_key text) returns jsonb
language plpgsql set search_path='' as $$
declare b public.ttc_casino_batches; ids jsonb; pos jsonb; n integer; i integer; x uuid; p public.ttc_prize_catalogue;
        snap jsonb; fp jsonb; chosen integer[] := '{}'; slot integer; tries integer;
begin
 if to_regprocedure('public.ttc_journey_publish(text,text,text,jsonb)') is null then
   perform public.ttc_fail('not-configured');
 end if;
 n := nullif(p_input->>'quantity','')::integer; ids := coalesce(p_input->'prizeIds','[]'::jsonb);
 pos := p_input->'prizePositions';
 if n is null or n not between 1 and 50 or jsonb_typeof(ids)<>'array' or jsonb_array_length(ids)>n
    or coalesce(p_key,'') !~ '^[A-Za-z0-9:_.-]{8,120}$' then perform public.ttc_fail('invalid'); end if;
 if pos is not null and jsonb_typeof(pos) <> 'null' then
   if jsonb_typeof(pos)<>'array' or jsonb_array_length(pos)<>jsonb_array_length(ids) then perform public.ttc_fail('invalid'); end if;
   for i in 0..jsonb_array_length(pos)-1 loop
     if jsonb_typeof(pos->i)<>'number' or (pos->>i)::integer not between 1 and n
        or (select count(*) from jsonb_array_elements(pos) e where e = pos->i) > 1 then perform public.ttc_fail('invalid'); end if;
   end loop;
 else
   pos := null;
 end if;
 fp := jsonb_build_object('quantity',n,'prizeIds',ids,'announce',coalesce((p_input->>'announce')::boolean,true));
 if pos is not null then fp := fp || jsonb_build_object('prizePositions',pos); end if;
 perform 1 from public.ttc_members where id=p_member for update;
 select * into b from public.ttc_casino_batches where member_id=p_member and idempotency_key=p_key;
 if b.id is not null then
   if b.fingerprint<>fp then perform public.ttc_fail('idempotency-conflict'); end if;
   return jsonb_build_object('batchId',b.id,'quantity',b.quantity,'remaining',b.quantity-b.next_position+1,'status',b.status,'duplicate',true);
 end if;
 for i in 0..jsonb_array_length(ids)-1 loop
   select * into p from public.ttc_prize_catalogue where id=(ids->>i)::uuid and active;
   if p.id is null then perform public.ttc_fail('not-found'); end if;
   if p.kind='VAULT_GIFT' and not exists(select 1 from public.ttc_vaults v where v.id=p.vault_id and v.trigger='casino' and v.state='locked') then
     perform public.ttc_fail('invalid'); end if;
 end loop;
 insert into public.ttc_casino_batches(member_id,quantity,idempotency_key,fingerprint)
 values(p_member,n,p_key,fp) returning * into b;
 if pos is not null then
   for i in 0..jsonb_array_length(pos)-1 loop chosen := array_append(chosen,(pos->>i)::integer); end loop;
 end if;
 for i in 0..jsonb_array_length(ids)-1 loop
   x := (ids->>i)::uuid;
   select * into p from public.ttc_prize_catalogue where id=x;
   if p.kind='VAULT_GIFT' and exists(
     select 1 from public.ttc_casino_allocations used
       join public.ttc_casino_batches other on other.id=used.batch_id
       where used.snapshot->>'vaultId'=p.vault_id::text and other.status<>'cancelled'
   ) then perform public.ttc_fail('conflict'); end if;
   snap := public.ttc_casino_prize_snapshot(p);
   if pos is not null then
     slot := (pos->>i)::integer;
   else
     tries := 0;
     loop
       slot := 1+floor(random()*n)::integer;
       exit when not slot=any(chosen);
       tries := tries+1;
       if tries>200 then select s into slot from generate_series(1,n) s where not s=any(chosen) order by random() limit 1; exit; end if;
     end loop;
     chosen := array_append(chosen,slot);
   end if;
   insert into public.ttc_casino_allocations(batch_id,position,prize_id,snapshot) values(b.id,slot,x,snap);
 end loop;
 perform public.ttc_journey_publish('casino.spins.issued','casino','spins-batch-'||b.id,
   jsonb_build_object('batchId',b.id,'quantity',n,'announce',coalesce((p_input->>'announce')::boolean,true)));
 insert into public.ttc_activity_events(type,detail) values('casino.spins.issued',jsonb_build_object('batchId',b.id,'quantity',n,'prizes',jsonb_array_length(ids)));
 return jsonb_build_object('batchId',b.id,'quantity',n,'remaining',n,'status','active','duplicate',false);
end $$;

-- Milestone hooks: prizes by slug (resolved when the milestone fires, so the
-- owner never copies ids), and drinks grants.
alter function public.ttc_journey_hook(text, jsonb, text) rename to ttc_journey_hook_casino;
create function public.ttc_journey_hook(p_name text, p_params jsonb, p_idempotency_key text) returns jsonb
language plpgsql set search_path = '' as $$
declare m uuid; v_ids jsonb := '[]'::jsonb; v_slug text; v_id uuid; v_params jsonb;
begin
 select id into m from public.ttc_members where slug = 'alise' and enabled;
 if m is null then perform public.ttc_fail('not-configured'); end if;
 if p_name = 'drinks.grant' then
   perform 1 from public.ttc_members where id = m for update;
   return public.ttc_drink_grant(m, p_params->>'kind', nullif(p_params->>'quantity','')::integer, 'milestone',
     'milestone:' || p_idempotency_key, coalesce(p_params->>'note',''));
 end if;
 v_params := coalesce(p_params, '{}'::jsonb);
 if p_name = 'casino.spins.issue' and jsonb_typeof(v_params->'prizeSlugs') = 'array' then
   for v_slug in select jsonb_array_elements_text(v_params->'prizeSlugs') loop
     select id into v_id from public.ttc_prize_catalogue where slug = v_slug and active;
     if v_id is null then raise exception 'prize %: create it in Casino & rewards (with this slug) and make it active', v_slug; end if;
     v_ids := v_ids || to_jsonb(v_id::text);
   end loop;
   v_params := (v_params - 'prizeSlugs') || jsonb_build_object('prizeIds', coalesce(v_params->'prizeIds','[]'::jsonb) || v_ids);
 end if;
 return public.ttc_journey_hook_casino(p_name, v_params, p_idempotency_key);
end $$;

-- Casino actions: prize extras, the explicit CLAIM of drinks, films delivered.
alter function public.ttc_casino_action(uuid, text, text, jsonb) rename to ttc_casino_action_promised;
create function public.ttc_casino_action(p_actor uuid, p_role text, p_action text, p_input jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare m uuid; e public.ttc_reward_entitlements; result jsonb; v_id uuid; v_grant jsonb;
begin
 if p_action in ('owner-casino-prize-create','owner-casino-prize-update') then
   if p_role is distinct from 'owner' then perform public.ttc_fail('forbidden'); end if;
   if (p_input->>'drinksKind' is null) <> (p_input->>'drinksQuantity' is null)
      or (p_input->>'drinksKind' is not null and p_input->>'drinksKind' not in ('airport','jamaica'))
      or ((p_input->>'drinksKind' is not null or p_input->>'videoUrl' is not null) and p_input->>'kind' <> 'VOUCHER')
      or (p_input->>'slug' is not null and p_input->>'slug' !~ '^[a-z0-9-]{3,60}$') then
     perform public.ttc_fail('invalid'); end if;
   result := public.ttc_casino_action_promised(p_actor, p_role, p_action, p_input);
   v_id := (result->'prize'->>'id')::uuid;
   update public.ttc_prize_catalogue set slug = p_input->>'slug', drinks_kind = p_input->>'drinksKind',
     drinks_quantity = nullif(p_input->>'drinksQuantity','')::integer, video_url = p_input->>'videoUrl'
     where id = v_id;
   return result;
 elsif p_action = 'owner-casino-prizes' then
   if p_role is distinct from 'owner' then perform public.ttc_fail('forbidden'); end if;
   return jsonb_build_object('prizes', coalesce((select jsonb_agg(jsonb_build_object(
     'id',x.id,'title',x.title,'description',x.description,'presentation',x.presentation,
     'kind',x.kind,'imageUrl',x.image_url,'instructions',x.instructions,'validUntil',x.valid_until,
     'active',x.active,'ownerNotes',x.owner_notes,'vaultId',x.vault_id,
     'slug',x.slug,'drinksKind',x.drinks_kind,'drinksQuantity',x.drinks_quantity,'videoUrl',x.video_url) order by x.created_at)
     from public.ttc_prize_catalogue x), '[]'::jsonb));
 elsif p_action = 'voucher-claim' then
   -- Her explicit CLAIM of a prize that grants drinks: until she claims it,
   -- nothing is credited; the unclaimed prize survives any browser closure.
   select id into m from public.ttc_members where slug = 'alise' and enabled;
   if m is null then perform public.ttc_fail('not-configured'); end if;
   if p_role is distinct from 'member' or p_actor is distinct from m then perform public.ttc_fail('forbidden'); end if;
   perform 1 from public.ttc_members where id = m for update;
   select * into e from public.ttc_reward_entitlements where id = (p_input->>'id')::uuid and member_id = m for update;
   if e.id is null then perform public.ttc_fail('not-found'); end if;
   if e.kind <> 'VOUCHER' or e.snapshot->>'drinksKind' is null then perform public.ttc_fail('invalid'); end if;
   if e.state = 'FULFILLED' then
     return jsonb_build_object('entitlementId', e.id, 'state', 'CLAIMED', 'duplicate', true,
       'kind', e.snapshot->>'drinksKind', 'balance', public.ttc_drinks_balance(m, e.snapshot->>'drinksKind'));
   end if;
   if e.state <> 'AVAILABLE' then perform public.ttc_fail('conflict'); end if;
   v_grant := public.ttc_drink_grant(m, e.snapshot->>'drinksKind', (e.snapshot->>'drinksQuantity')::integer,
     'casino-claim', 'entitlement:' || e.id, e.snapshot->>'title');
   update public.ttc_reward_entitlements set state = 'FULFILLED', fulfilled_at = now() where id = e.id;
   insert into public.ttc_activity_events(type, detail) values ('reward.drinks.claimed',
     jsonb_build_object('entitlementId', e.id, 'kind', e.snapshot->>'drinksKind'));
   return jsonb_build_object('entitlementId', e.id, 'state', 'CLAIMED', 'duplicate', false,
     'kind', e.snapshot->>'drinksKind', 'balance', public.ttc_drinks_balance(m, e.snapshot->>'drinksKind'));
 elsif p_action = 'voucher-request' then
   -- Drinks are claimed, then requested one at a time; films are watched.
   select * into e from public.ttc_reward_entitlements where id = (p_input->>'id')::uuid;
   if e.snapshot->>'drinksKind' is not null or e.snapshot->>'videoUrl' is not null then perform public.ttc_fail('invalid'); end if;
 end if;
 result := public.ttc_casino_action_promised(p_actor, p_role, p_action, p_input);
 if p_action = 'casino-spin' and coalesce((result->>'duplicate')::boolean, false) = false
    and result->>'entitlementId' is not null and result->'prize'->>'videoUrl' is not null
    and result->'prize'->>'drinksKind' is null then
   -- A film is delivered by being shown: nothing for the owner to fulfil.
   update public.ttc_reward_entitlements set state = 'FULFILLED', fulfilled_at = now()
     where id = (result->>'entitlementId')::uuid and state = 'AVAILABLE';
 end if;
 return result;
end $$;

-- Seeded prizes the milestones reference by slug (owner-editable; no vault is
-- needed for these). The film is inactive until the owner supplies its URL.
insert into public.ttc_prize_catalogue(id, slug, title, description, presentation, kind, instructions, active,
  owner_notes, drinks_kind, drinks_quantity, video_url) values
 ('7a1e5c2e-0d3b-4b8e-9f10-000000000301', 'jamaica-drinks', 'Bring Me a Drink — three times',
  'Three Bring Me a Drink vouchers for the resort.',
  'The house has paid out, Madam. Three drinks, brought to you wherever you happen to be. You need only name them.',
  'VOUCHER', 'Claim them, then choose a drink whenever you wish. One voucher each time.', true,
  'PROPOSED wording (Story Bible unavailable to the engineer). Third spin of the 23 Oct morning batch. Grants 3 Jamaica drinks on her CLAIM.',
  'jamaica', 3, null),
 ('7a1e5c2e-0d3b-4b8e-9f10-000000000302', 'nyla-film', 'A message from Nyla',
  'A short film, kept in your collection to watch again.',
  'Someone has been very patient. She has something to show you.',
  'VOUCHER', '', false,
  'Set the film''s HTTPS (or /media/…) address in Video URL and make it active before the 23 Oct afternoon batch fires.',
  null, null, null)
on conflict do nothing;

/* ---------- 3. Gift Vault: compartments that open before the birthday ---------- */

alter table public.ttc_vaults add column opens_at timestamptz;

create function public.ttc_vault_effective_opens_at(v public.ttc_vaults) returns timestamptz
language sql stable set search_path = '' as $$
 select coalesce(v.opens_at, public.ttc_vault_opens_at())
$$;

create or replace function public.ttc_vault_owner_json(v public.ttc_vaults) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object('id',v.id,'slug',v.slug,'number',v.display_number,
  'clue',v.clue,'giftLocation',v.gift_location,'trigger',v.trigger,
  'availableAt',v.available_at,'casinoRewardId',v.casino_reward_id,'state',v.state,
  'nfcToken',v.nfc_token,'backupCode',v.backup_code,'readyAt',v.ready_at,
  'openedAt',v.opened_at,'openedVia',v.opened_via,'createdAt',v.created_at,'updatedAt',v.updated_at,
  'opensAt',v.opens_at)
$$;

alter function public.ttc_vault_action(uuid, text, text, jsonb) rename to ttc_vault_action_birthday;
create function public.ttc_vault_action(p_actor uuid, p_role text, p_action text, p_input jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare member uuid; v public.ttc_vaults; via text; result jsonb;
begin
 if p_action = 'vault-open' then
   select id into member from public.ttc_members where slug = 'alise' and enabled;
   if member is null then perform public.ttc_fail('not-configured'); end if;
   if p_role is distinct from 'member' or p_actor is distinct from member then perform public.ttc_fail('forbidden'); end if;
   perform public.ttc_vault_promote();
   if (p_input ? 'credentialHash') = (p_input ? 'codeHash') then perform public.ttc_fail('invalid'); end if;
   via := case when p_input ? 'credentialHash' then 'nfc' else 'code' end;
   if via = 'nfc' then
     select * into v from public.ttc_vaults where nfc_token_hash = p_input->>'credentialHash' for update;
   else
     select * into v from public.ttc_vaults where backup_code_hash = p_input->>'codeHash' for update;
   end if;
   if v.id is null then perform public.ttc_fail('credential-invalid'); end if;
   -- The compartment's own date (the birthday unless the owner set one).
   if now() < public.ttc_vault_effective_opens_at(v) then perform public.ttc_fail('not-open'); end if;
   if v.state = 'opened' then
     return jsonb_build_object('vault', public.ttc_vault_member_json(v), 'alreadyOpened', true);
   end if;
   if v.state <> 'ready' then perform public.ttc_fail('vault-locked'); end if;
   update public.ttc_vaults set state = 'opened', opened_at = now(), opened_via = via, updated_at = now()
     where id = v.id returning * into v;
   insert into public.ttc_activity_events(type, detail) values ('vault.opened', jsonb_build_object('vaultId', v.id, 'slug', v.slug, 'via', via));
   return jsonb_build_object('vault', public.ttc_vault_member_json(v), 'alreadyOpened', false);
 end if;

 result := public.ttc_vault_action_birthday(p_actor, p_role, p_action, p_input);

 if p_action = 'vault-list' and not coalesce((result->>'open')::boolean, true) then
   -- Before the birthday, a compartment with its own earlier date shows as it
   -- really is (its clue once ready, its gift once opened); the rest stay sealed.
   result := jsonb_set(result, '{vaults}', coalesce((select jsonb_agg(
       case when now() >= public.ttc_vault_effective_opens_at(x) then public.ttc_vault_member_json(x)
            else jsonb_build_object('id',x.slug,'number',x.display_number,'state','locked',
              'clue',null,'giftLocation',null,'readyAt',null,'openedAt',null) end
       order by x.display_number) from public.ttc_vaults x), '[]'::jsonb));
   result := result || jsonb_build_object('early', exists(select 1 from public.ttc_vaults x
     where x.opens_at is not null and now() >= x.opens_at));
 elsif p_action in ('owner-vault-create','owner-vault-update') and p_input ? 'opensAt' then
   update public.ttc_vaults set opens_at = (p_input->>'opensAt')::timestamptz, updated_at = now()
     where id = (result->'vault'->>'id')::uuid returning * into v;
   result := jsonb_build_object('vault', public.ttc_vault_owner_json(v));
 end if;
 return result;
end $$;

/* ---------- 4. REHEARSAL: the owner's notifications go to the test number ---------- */

-- In REHEARSAL mode only, claims one approved message to the owner (never
-- Alise) so it can be sent to SMS_REHEARSAL_TO with the rehearsal banner.
create function public.ttc_sms_claim_rehearsal() returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare m public.ttc_messages;
begin
 if public.ttc_sms_mode() is distinct from 'rehearsal' then return 'null'::jsonb; end if;
 select * into m from public.ttc_messages
   where state = 'approved' and approved_at is not null and send_at <= now()
     and coalesce(next_attempt_at, send_at) <= now() and attempts < 5
     and category in ('correspondence-arron','transactional-arron')
   order by send_at limit 1 for update skip locked;
 if m.id is null then return 'null'::jsonb; end if;
 update public.ttc_messages set state = 'sending', claimed_at = now(), claim_id = gen_random_uuid(),
   attempts = attempts + 1 where id = m.id returning * into m;
 insert into public.ttc_message_delivery_logs(message_id, state, error) values (m.id, 'sending', 'REHEARSAL: to the owner test number');
 return public.ttc_message_json(m) || jsonb_build_object('claimId', m.claim_id, 'rehearsal', true);
end $$;

-- Right after her request: the oldest due notification to the owner, under
-- the same policy (LIVE: as ttc_sms_claim; REHEARSAL: for the test number), so
-- her request is not queued behind letters to her. Never claims an Alise SMS.
create function public.ttc_sms_claim_owner() returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare m public.ttc_messages; v_mode text;
begin
 v_mode := public.ttc_sms_mode();
 if v_mode not in ('live','rehearsal') then return 'null'::jsonb; end if;
 select * into m from public.ttc_messages
   where state = 'approved' and approved_at is not null and send_at <= now()
     and coalesce(next_attempt_at, send_at) <= now() and attempts < 5
     and category in ('correspondence-arron','transactional-arron')
   order by send_at limit 1 for update skip locked;
 if m.id is null then return 'null'::jsonb; end if;
 update public.ttc_messages set state = 'sending', claimed_at = now(), claim_id = gen_random_uuid(),
   attempts = attempts + 1 where id = m.id returning * into m;
 insert into public.ttc_message_delivery_logs(message_id, state, error)
   values (m.id, 'sending', case when v_mode = 'rehearsal' then 'REHEARSAL: to the owner test number' end);
 return public.ttc_message_json(m) || jsonb_build_object('claimId', m.claim_id, 'rehearsal', v_mode = 'rehearsal');
end $$;

alter function public.ttc_sms_action(uuid, text, text, jsonb) rename to ttc_sms_action_live;
create function public.ttc_sms_action(p_actor uuid, p_role text, p_action text, p_input jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
 if p_action = 'system-sms-claim-rehearsal' then
   if p_role is distinct from 'system' then perform public.ttc_fail('forbidden'); end if;
   return public.ttc_sms_claim_rehearsal();
 elsif p_action = 'system-sms-claim-owner' then
   if p_role is distinct from 'system' then perform public.ttc_fail('forbidden'); end if;
   return public.ttc_sms_claim_owner();
 end if;
 return public.ttc_sms_action_live(p_actor, p_role, p_action, p_input);
end $$;

/* ---------- 5. The holiday, 22-25 October (held; PROPOSED wording) ---------- */

-- The existing seeds keep their keys (and any wording the owner has edited);
-- only unfired, unedited ones are updated. New milestones are held: resuming
-- is the owner's approval. All wording below is PROPOSED — the Story Bible was
-- not available to the engineer — and is replaced in the journey tab.
update public.ttc_journey_milestones set
  title = 'Thu 22 Oct, morning — the UGGs clue (Vault key in the cupboard)',
  description = 'PROPOSED wording. The clue letter for the UGGs. Create the UGGs compartment in the Gift Vault (trigger manual or scheduled, "Opens before the birthday" set to this morning), place its NFC key with the shoes in the cupboard, then resume.',
  updated_at = now()
 where key = 'departure-ugg' and state <> 'fired';
update public.ttc_journey_milestones set
  title = 'Thu 22 Oct, departure — the Departure Lounge and the Butler',
  description = 'PROPOSED wording. Introduces the Departure Lounge and A Word with the Butler (the bell). Resume when you leave for the airport.',
  effects = '[{"type":"letter","title":"Your departure","body":"Madam, your departure has been noted with the appropriate ceremony. The Departure Lounge is now open to you; you will find it in the Directory. Should you require anything at all on the journey, you need only ring for me — A Word with the Butler, from the bell. I shall see to it personally."}]'::jsonb,
  updated_at = now()
 where key = 'departure-privileges' and state <> 'fired'
   and effects = '[{"type":"letter","title":"Your airport privileges","body":"Your airport privileges are prepared: a little Duty Free, a drink, and something to eat. You will find them in the Departure Lounge."}]'::jsonb;
update public.ttc_journey_milestones set
  title = 'Thu 22 Oct, at the gate — the AirPods clue (Vault key)',
  description = 'PROPOSED wording. The clue for the AirPods compartment (its NFC key hidden near her; its gift text should say her husband has the gift). Set the compartment''s "Opens before the birthday" to this time, then resume or trigger at the gate.',
  updated_at = now()
 where key = 'departure-airpods' and state <> 'fired';

insert into public.ttc_journey_milestones(key,title,description,fire_at,state,effects,sort,timezone) values
 ('airport-drinks','Thu 22 Oct, after security — two airport drinks',
  'Grants TWO airport drinks (her husband pays) and the Butler''s note. PROPOSED wording. Trigger now once you are through security, or resume for the time shown.',
  '2026-10-22 13:30:00+01','held',
  '[{"type":"hook","name":"drinks.grant","params":{"kind":"airport","quantity":2}},{"type":"letter","title":"Two drinks, with the club''s compliments","body":"Madam, now that the formalities are behind you, the club would like you to have two drinks before the flight, with its compliments. You will find them under Drinks in the Members'' Lounge. Choose whatever you like and I shall pass word to your husband, who has very kindly agreed to settle the bill."}]',32,'Europe/London'),
 ('flight-departure','Thu 22 Oct — the flight departs',
  'PROPOSED wording. Trigger now when the aircraft leaves, or resume for the scheduled time.',
  '2026-10-22 15:30:00+01','held',
  '[{"type":"letter","title":"Bon voyage","body":"Madam, the club wishes you a most agreeable flight. Do rest; Jamaica will keep. I shall write again when you land."}]',42,'Europe/London'),
 ('casino-afternoon-spins','Fri 23 Oct, afternoon — three spins (Nyla''s film on the third)',
  'Three spins; the third reveals Nyla''s film (prize slug nyla-film: set its Video URL and make it active first). PROPOSED.',
  '2026-10-23 14:30:00-05','held',
  '[{"type":"hook","name":"casino.spins.issue","params":{"quantity":3,"prizeSlugs":["nyla-film"],"prizePositions":[3],"announce":true}}]',55,'America/Jamaica'),
 ('casino-evening-spins','Fri 23 Oct, evening — three spins (the 777 jackpot on the third)',
  'Three spins; the third is the 777 jackpot, which readies the breakfast compartment in the Gift Vault. First create that compartment (trigger casino) and a VAULT_GIFT prize with slug evening-jackpot linked to it. PROPOSED.',
  '2026-10-23 20:00:00-05','held',
  '[{"type":"hook","name":"casino.spins.issue","params":{"quantity":3,"prizeSlugs":["evening-jackpot"],"prizePositions":[3],"announce":true}}]',59,'America/Jamaica'),
 ('birthday-midnight-letter','Sat 24 Oct, 00:00 — the Butler''s birthday letter',
  'PROPOSED wording. Waits in the Lounge at midnight in Jamaica; the Screening Room invitation (birthday-screening) follows it.',
  '2026-10-24 00:00:00-05','held',
  '[{"type":"letter","title":"Many happy returns, Madam","body":"Madam, it is midnight, and the club is delighted to be among the first to wish you a very happy thirtieth birthday. A few people have asked to say a word or two. The Private Screening Room has been prepared for them."}]',69,'America/Jamaica'),
 ('birthday-card','Sat 24 Oct — your private birthday card',
  'PROPOSED wording. Points her to the card (also reachable by its NFC tag at /birthdaycard). Trigger when you hand it over, or resume for the time shown.',
  '2026-10-24 12:00:00-05','held',
  '[{"type":"letter","title":"A card, delivered by hand","body":"Madam, a card has been left for you. It is not the sort of thing one reads aloud. Open it at your leisure: https://30.ag14.co/birthdaycard"}]',82,'America/Jamaica'),
 ('farewell','Sun 25 Oct — farewell',
  'PROPOSED wording. Makes no promise of any excursion. Resume for the time shown, or trigger when you wish.',
  '2026-10-25 18:00:00-05','held',
  '[{"type":"letter","title":"With the club''s compliments","body":"Madam, it has been the greatest privilege to look after you these last few days. Your membership does not expire; the Lounge, your letters and everything you have won remain yours. The club remains, as ever, at your service."}]',90,'America/Jamaica')
on conflict (key) do nothing;

-- The opening batch: three spins, the Jamaica drinks on the third (unchanged
-- if the owner has already edited it or it has fired).
update public.ttc_journey_milestones set
  title = 'Fri 23 Oct, opening — three spins (Bring Me a Drink on the third)',
  description = 'Three spins issued just before the Casino admission; the third wins three Bring Me a Drink vouchers (prize slug jamaica-drinks), which she CLAIMS. Resume to arm. While held, the admission letter does not mention spins.',
  effects = '[{"type":"hook","name":"casino.spins.issue","params":{"quantity":3,"prizeSlugs":["jamaica-drinks"],"prizePositions":[3],"announce":false}}]'::jsonb,
  updated_at = now()
 where key = 'casino-opening-spins' and state <> 'fired'
   and effects = '[{"type":"hook","name":"casino.spins.issue","params":{"quantity":5,"announce":false}}]'::jsonb;

-- Breakfast is announced only after the physical delivery: never on a clock.
update public.ttc_journey_milestones set
  title = 'Sat 24 Oct — breakfast (trigger once it has been delivered)',
  description = 'Trigger now only after breakfast has physically arrived. PROPOSED wording. No scheduled time is relied upon: keep it held until then.',
  updated_at = now()
 where key = 'birthday-breakfast' and state <> 'fired';

/* ---------- Security ---------- */

alter table public.ttc_drink_grants enable row level security;
alter table public.ttc_drink_requests enable row level security;
revoke all on public.ttc_drink_grants, public.ttc_drink_requests from public, anon, authenticated;
grant all on public.ttc_drink_grants, public.ttc_drink_requests to service_role;
create policy service_only on public.ttc_drink_grants for all to service_role using (true) with check (true);
create policy service_only on public.ttc_drink_requests for all to service_role using (true) with check (true);
do $$ declare obj record; begin
 for obj in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('ttc_drinks_balance','ttc_drink_notice','ttc_drink_grant','ttc_drinks_action',
     'ttc_casino_prize_snapshot','ttc_casino_issue','ttc_journey_hook','ttc_journey_hook_casino',
     'ttc_casino_action','ttc_casino_action_promised',
     'ttc_vault_effective_opens_at','ttc_vault_owner_json','ttc_vault_action','ttc_vault_action_birthday',
     'ttc_sms_claim_rehearsal','ttc_sms_claim_owner','ttc_sms_action','ttc_sms_action_live') loop
   execute format('revoke all on function %s from public, anon, authenticated', obj.signature);
   execute format('grant execute on function %s to service_role', obj.signature);
 end loop;
end $$;
