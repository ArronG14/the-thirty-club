-- The Private Gift Vault. Compartments move LOCKED -> READY -> OPENED and
-- never back from OPENED. The member sees a clue only once READY and the gift
-- location only once OPENED. The physical gift's identity is never stored.
-- Separate RPC from ttc_action so the existing privilege/SMS paths are untouched.
create table public.ttc_vaults (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^vault-[0-9]{3}$'),
  display_number integer unique not null check (display_number between 1 and 999),
  clue text not null default '' check (length(clue) <= 1000),
  gift_location text not null default '' check (length(gift_location) <= 1000),
  trigger text not null default 'manual' check (trigger in ('manual','scheduled','casino')),
  available_at timestamptz,
  casino_reward_id text check (casino_reward_id is null or casino_reward_id ~ '^[a-z0-9.-]{3,80}$'),
  state text not null default 'locked' check (state in ('locked','ready','opened')),
  -- Bearer secrets. Plain values are shown only to the owner (to program the
  -- tag and print the code); lookups go through the SHA-256 hashes.
  nfc_token text unique not null check (nfc_token ~ '^[A-Za-z0-9_-]{43}$'),
  nfc_token_hash text unique not null,
  backup_code text unique not null check (backup_code ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  backup_code_hash text unique not null,
  ready_at timestamptz, opened_at timestamptz,
  opened_via text check (opened_via in ('nfc','code','owner')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (trigger <> 'scheduled' or available_at is not null),
  check (trigger <> 'casino' or casino_reward_id is not null),
  check ((state = 'opened') = (opened_at is not null)),
  check (state = 'locked' or ready_at is not null)
);

-- The birthday time-lock. No compartment opens, and no clue is shown, before
-- 24 October 2026 00:00 in Jamaica, whatever the device clock says.
create function public.ttc_vault_opens_at() returns timestamptz
language sql stable set search_path = '' as $$
 select '2026-10-24 00:00:00 America/Jamaica'::timestamptz
$$;

create function public.ttc_vault_member_json(v public.ttc_vaults) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object('id',v.slug,'number',v.display_number,'state',v.state,
  'clue',case when v.state in ('ready','opened') then v.clue end,
  'giftLocation',case when v.state='opened' then v.gift_location end,
  'readyAt',v.ready_at,'openedAt',v.opened_at)
$$;

create function public.ttc_vault_owner_json(v public.ttc_vaults) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object('id',v.id,'slug',v.slug,'number',v.display_number,
  'clue',v.clue,'giftLocation',v.gift_location,'trigger',v.trigger,
  'availableAt',v.available_at,'casinoRewardId',v.casino_reward_id,'state',v.state,
  'nfcToken',v.nfc_token,'backupCode',v.backup_code,'readyAt',v.ready_at,
  'openedAt',v.opened_at,'openedVia',v.opened_via,'createdAt',v.created_at,'updatedAt',v.updated_at)
$$;

-- Scheduled compartments become READY lazily, on any vault read or write.
create function public.ttc_vault_promote() returns void
language plpgsql security invoker set search_path = '' as $$
declare v record;
begin
 for v in update public.ttc_vaults set state='ready', ready_at=available_at, updated_at=now()
   where state='locked' and trigger='scheduled' and available_at<=now() returning id, slug loop
   insert into public.ttc_activity_events(type,detail) values('vault.ready',jsonb_build_object('vaultId',v.id,'slug',v.slug,'via','schedule'));
 end loop;
end $$;

create function public.ttc_vault_action(p_actor uuid, p_role text, p_action text, p_input jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 member uuid; v public.ttc_vaults; hits integer; expires timestamptz; via text; n integer; s text;
begin
 select id into member from public.ttc_members where slug='alise' and enabled;
 if member is null then perform public.ttc_fail('not-configured'); end if;
 if p_role not in ('system','owner','member') or p_role is null then perform public.ttc_fail('forbidden'); end if;
 if p_role='member' and (p_actor is distinct from member) then perform public.ttc_fail('forbidden'); end if;
 if p_action like 'owner-%' and p_role<>'owner' then perform public.ttc_fail('forbidden'); end if;
 if p_action like 'system-%' and p_role<>'system' then perform public.ttc_fail('forbidden'); end if;
 if p_action in ('vault-list','vault-open') and p_role<>'member' then perform public.ttc_fail('forbidden'); end if;
 perform public.ttc_vault_promote();

 if p_action='system-member-bridge' then
   -- The server has already verified a live-realm membership credential session.
   expires := now()+interval '30 days';
   insert into public.ttc_sessions(token_hash,role,member_id,expires_at) values(p_input->>'hash','member',member,expires);
   insert into public.ttc_activity_events(type) values('membership.bridged');
   return jsonb_build_object('role','member','memberId',member,'expiresAt',expires);
 elsif p_action='system-vault-attempts' then
   delete from public.ttc_rate_limits where expires_at<now();
   select r.hits into hits from public.ttc_rate_limits r where bucket=p_input->>'bucket';
   return jsonb_build_object('allowed',coalesce(hits,0)<20);
 elsif p_action='system-vault-failure' then
   insert into public.ttc_rate_limits(bucket,hits,expires_at) values(p_input->>'bucket',1,now()+interval '15 minutes')
   on conflict(bucket) do update set hits=public.ttc_rate_limits.hits+1;
   return '{"ok":true}';
 elsif p_action='system-vault-casino' then
   -- A server-verified casino outcome released this reward: its compartments become READY.
   n := 0;
   for v in select * from public.ttc_vaults where trigger='casino' and casino_reward_id=p_input->>'rewardId' and state='locked' for update loop
     update public.ttc_vaults set state='ready', ready_at=now(), updated_at=now() where id=v.id;
     insert into public.ttc_activity_events(type,detail) values('vault.ready',jsonb_build_object('vaultId',v.id,'slug',v.slug,'via','casino'));
     n := n+1;
   end loop;
   return jsonb_build_object('released',n);

 elsif p_action='vault-list' then
   if now()<public.ttc_vault_opens_at() then
     return jsonb_build_object('open',false,'opensAt',public.ttc_vault_opens_at(),
      'vaults',coalesce((select jsonb_agg(jsonb_build_object('id',x.slug,'number',x.display_number,'state','locked',
        'clue',null,'giftLocation',null,'readyAt',null,'openedAt',null) order by x.display_number) from public.ttc_vaults x),'[]'));
   end if;
   return jsonb_build_object('open',true,'opensAt',public.ttc_vault_opens_at(),
    'vaults',coalesce((select jsonb_agg(public.ttc_vault_member_json(x) order by x.display_number) from public.ttc_vaults x),'[]'));
 elsif p_action='vault-open' then
   if (p_input ? 'credentialHash') = (p_input ? 'codeHash') then perform public.ttc_fail('invalid'); end if;
   via := case when p_input ? 'credentialHash' then 'nfc' else 'code' end;
   -- The row lock serialises concurrent scans: the second sees OPENED.
   if via='nfc' then
     select * into v from public.ttc_vaults where nfc_token_hash=p_input->>'credentialHash' for update;
   else
     select * into v from public.ttc_vaults where backup_code_hash=p_input->>'codeHash' for update;
   end if;
   if v.id is null then perform public.ttc_fail('credential-invalid'); end if;
   if now()<public.ttc_vault_opens_at() then perform public.ttc_fail('not-open'); end if;
   if v.state='opened' then
     return jsonb_build_object('vault',public.ttc_vault_member_json(v),'alreadyOpened',true);
   end if;
   if v.state<>'ready' then perform public.ttc_fail('vault-locked'); end if;
   update public.ttc_vaults set state='opened', opened_at=now(), opened_via=via, updated_at=now() where id=v.id returning * into v;
   insert into public.ttc_activity_events(type,detail) values('vault.opened',jsonb_build_object('vaultId',v.id,'slug',v.slug,'via',via));
   return jsonb_build_object('vault',public.ttc_vault_member_json(v),'alreadyOpened',false);

 elsif p_action='owner-vault-list' then
   return jsonb_build_object('opensAt',public.ttc_vault_opens_at(),
    'vaults',coalesce((select jsonb_agg(public.ttc_vault_owner_json(x) order by x.display_number) from public.ttc_vaults x),'[]'));
 elsif p_action in ('owner-vault-create','owner-vault-update') then
   if p_input->>'trigger' not in ('manual','scheduled','casino') then perform public.ttc_fail('invalid'); end if;
   if exists(select 1 from public.ttc_vaults x where x.display_number=(p_input->>'displayNumber')::integer
     and x.id is distinct from (p_input->>'id')::uuid) then perform public.ttc_fail('conflict'); end if;
   if p_action='owner-vault-create' then
     -- The id follows the engraved number unless a renumbered vault already holds it.
     s := 'vault-'||lpad(p_input->>'displayNumber',3,'0');
     if exists(select 1 from public.ttc_vaults x where x.slug=s) then
       select 'vault-'||lpad(g::text,3,'0') into s from generate_series(1,999) g
        where not exists(select 1 from public.ttc_vaults x where x.slug='vault-'||lpad(g::text,3,'0')) order by g limit 1;
     end if;
     insert into public.ttc_vaults(slug,display_number,clue,gift_location,trigger,available_at,casino_reward_id,nfc_token,nfc_token_hash,backup_code,backup_code_hash)
     values(s,(p_input->>'displayNumber')::integer,p_input->>'clue',p_input->>'giftLocation',
       p_input->>'trigger',(p_input->>'availableAt')::timestamptz,p_input->>'casinoRewardId',
       p_input->>'nfcToken',p_input->>'nfcTokenHash',p_input->>'backupCode',p_input->>'backupCodeHash') returning * into v;
     insert into public.ttc_activity_events(type,detail) values('vault.created',jsonb_build_object('vaultId',v.id,'slug',v.slug));
   else
     select * into v from public.ttc_vaults where id=(p_input->>'id')::uuid for update;
     if v.id is null then perform public.ttc_fail('not-found'); end if;
     -- The location stays editable after opening (a present may be moved).
     update public.ttc_vaults set display_number=(p_input->>'displayNumber')::integer, clue=p_input->>'clue',
       gift_location=p_input->>'giftLocation', trigger=p_input->>'trigger',
       available_at=(p_input->>'availableAt')::timestamptz, casino_reward_id=p_input->>'casinoRewardId', updated_at=now()
       where id=v.id returning * into v;
     insert into public.ttc_activity_events(type,detail) values('vault.saved',jsonb_build_object('vaultId',v.id,'slug',v.slug));
   end if;
   perform public.ttc_vault_promote();
   select * into v from public.ttc_vaults where id=v.id;
   return jsonb_build_object('vault',public.ttc_vault_owner_json(v));
 elsif p_action in ('owner-vault-ready','owner-vault-lock','owner-vault-open','owner-vault-rotate') then
   select * into v from public.ttc_vaults where id=(p_input->>'id')::uuid for update;
   if v.id is null then perform public.ttc_fail('not-found'); end if;
   if p_action='owner-vault-ready' then
     if v.state='locked' then
       update public.ttc_vaults set state='ready', ready_at=now(), updated_at=now() where id=v.id returning * into v;
       insert into public.ttc_activity_events(type,detail) values('vault.ready',jsonb_build_object('vaultId',v.id,'slug',v.slug,'via','owner'));
     end if;
   elsif p_action='owner-vault-lock' then
     if v.state='opened' then perform public.ttc_fail('conflict'); end if;
     if v.trigger='scheduled' and v.available_at<=now() then perform public.ttc_fail('conflict'); end if;
     if v.state='ready' then
       update public.ttc_vaults set state='locked', ready_at=null, updated_at=now() where id=v.id returning * into v;
       insert into public.ttc_activity_events(type,detail) values('vault.locked',jsonb_build_object('vaultId',v.id,'slug',v.slug));
     end if;
   elsif p_action='owner-vault-open' then
     if v.state<>'opened' then
       update public.ttc_vaults set state='opened', ready_at=coalesce(ready_at,now()), opened_at=now(), opened_via='owner', updated_at=now()
         where id=v.id returning * into v;
       insert into public.ttc_activity_events(type,detail) values('vault.opened',jsonb_build_object('vaultId',v.id,'slug',v.slug,'via','owner'));
     end if;
   else
     update public.ttc_vaults set
       nfc_token=coalesce(p_input->>'nfcToken',nfc_token), nfc_token_hash=coalesce(p_input->>'nfcTokenHash',nfc_token_hash),
       backup_code=coalesce(p_input->>'backupCode',backup_code), backup_code_hash=coalesce(p_input->>'backupCodeHash',backup_code_hash),
       updated_at=now() where id=v.id returning * into v;
     insert into public.ttc_activity_events(type,detail) values('vault.credential-rotated',jsonb_build_object('vaultId',v.id,'slug',v.slug));
   end if;
   return jsonb_build_object('vault',public.ttc_vault_owner_json(v));
 elsif p_action='owner-vault-preview' then
   -- Read-only rehearsal: the member's view of this compartment, as READY and then OPENED.
   select * into v from public.ttc_vaults where id=(p_input->>'id')::uuid;
   if v.id is null then perform public.ttc_fail('not-found'); end if;
   return jsonb_build_object('vault',public.ttc_vault_member_json(v),
     'ready',jsonb_build_object('id',v.slug,'number',v.display_number,'state','ready','clue',v.clue,'giftLocation',null,'readyAt',now(),'openedAt',null),
     'opened',jsonb_build_object('id',v.slug,'number',v.display_number,'state','opened','clue',v.clue,'giftLocation',v.gift_location,'readyAt',now(),'openedAt',now()));
 elsif p_action='owner-vault-verify' then
   -- Tag test on the owner's phone: identifies the compartment, changes nothing.
   if (p_input ? 'credentialHash') = (p_input ? 'codeHash') then perform public.ttc_fail('invalid'); end if;
   select * into v from public.ttc_vaults where nfc_token_hash=p_input->>'credentialHash' or backup_code_hash=p_input->>'codeHash';
   if v.id is null then perform public.ttc_fail('credential-invalid'); end if;
   return jsonb_build_object('vaultId',v.id,'number',v.display_number,'state',v.state);
 end if;
 perform public.ttc_fail('not-found'); return null;
end $$;

create index ttc_vaults_casino_idx on public.ttc_vaults(casino_reward_id) where trigger='casino' and state='locked';
create index ttc_vaults_scheduled_idx on public.ttc_vaults(available_at) where trigger='scheduled' and state='locked';

alter table public.ttc_vaults enable row level security;
revoke all on public.ttc_vaults from public, anon, authenticated;
grant all on public.ttc_vaults to service_role;
create policy service_only on public.ttc_vaults for all to service_role using (true) with check (true);
do $$ declare obj record; begin
 for obj in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname like 'ttc_vault%' loop
   execute format('revoke all on function %s from public, anon, authenticated',obj.signature);
   execute format('grant execute on function %s to service_role',obj.signature);
 end loop;
end $$;
