-- ADR-027. Local preparation only: approval is required before hosted application.
-- Does not reset admissions, cards, rewards, opened letters, sends or credentials.
-- CLI-created file reordered after the repository's future-dated migration chain.
alter table public.ttc_journey_milestones
 add column story_managed boolean not null default false,
 add column manual_only boolean not null default false,
 add column story_approved boolean not null default false,
 add column story_disabled boolean not null default false,
 add column requires_keys text[] not null default '{}',
 add column story_sms text,
 add column story_vault_id uuid references public.ttc_vaults(id);

alter table public.ttc_membership_card add column admission_presented_at timestamptz;

-- A retained membership scope does not prove an explicit presentation.
-- An already admitted member remains admitted; no completed LIVE state changes.
alter function public.ttc_journey_action(uuid,text,text,jsonb) rename to ttc_journey_action_before_story;
create function public.ttc_journey_action(p_actor uuid,p_role text,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.ttc_journey_milestones; member uuid; result jsonb;
begin
 if p_action='system-journey-card' and p_role='system' then
   select id into member from public.ttc_members where slug='alise' and enabled;
   if not public.ttc_room_admitted(member,'lounge') and p_input->>'cardPresentedAt' is null then
     perform public.ttc_fail('card-required');
   end if;
 end if;
 if p_action='journey-enter' and p_role='member' and not public.ttc_room_admitted(p_actor,'lounge') then
   select * into m from public.ttc_journey_milestones where key='early-membership';
   if m.state='fired' and now()>=greatest(m.fire_at,'2026-10-21T18:00:00Z'::timestamptz) and not exists(select 1 from public.ttc_membership_card c where c.member_id=p_actor
     and c.admission_presented_at>=greatest(m.fire_at,'2026-10-21T18:00:00Z'::timestamptz)) then
     perform public.ttc_fail('card-required');
   end if;
 end if;
 if p_action='owner-journey-milestone-update' and p_role='owner' then
   select * into m from public.ttc_journey_milestones where key=p_input->>'key' for update;
   if m.state='fired' and (p_input ? 'storyApproved' or p_input ? 'storySms' or p_input ? 'storyVaultId') then
     perform public.ttc_fail('conflict');
   end if;
   -- Any editorial/configuration change requires a fresh, explicit review.
   if m.story_managed and (p_input ? 'effects' or p_input ? 'fireAt' or p_input ? 'storySms' or p_input ? 'storyVaultId') then
     update public.ttc_journey_milestones set story_approved=false where key=m.key;
   end if;
 end if;
 if p_action='owner-journey-milestone-resume' and p_role='owner' then
   select * into m from public.ttc_journey_milestones where key=p_input->>'key';
   if m.manual_only or m.story_disabled then perform public.ttc_fail('invalid'); end if;
 end if;
 result:=public.ttc_journey_action_before_story(p_actor,p_role,p_action,p_input);
 if p_action='system-journey-card' and p_role='system' and p_input->>'cardPresentedAt' is not null then
   update public.ttc_membership_card set admission_presented_at=greatest(admission_presented_at,
     to_timestamp((p_input->>'cardPresentedAt')::double precision/1000)) where member_id=member;
 end if;
 if p_action='journey-state' and p_role='member' then
   result:=result||jsonb_build_object('departure',jsonb_build_object(
     'available',exists(select 1 from public.ttc_journey_milestones where key='departure-privileges' and state='fired'),
     'body',coalesce((select l.body from public.ttc_letters l where l.journey_ref like 'milestone:departure-privileges:%' order by published_at desc limit 1),''),
     'introduced',exists(select 1 from public.ttc_departure_introduction where member_id=p_actor)));
 end if;
 if p_action='owner-journey-milestone-update' and p_role='owner' then
   update public.ttc_journey_milestones set
     story_sms=case when p_input ? 'storySms' then p_input->>'storySms' else story_sms end,
     story_vault_id=case when p_input ? 'storyVaultId' then nullif(p_input->>'storyVaultId','')::uuid else story_vault_id end,
     story_approved=case when p_input ? 'storyApproved' then (p_input->>'storyApproved')::boolean else story_approved end
   where key=p_input->>'key' returning * into m;
   if p_input ? 'storyApproved' then
     insert into public.ttc_activity_events(type,detail) values('journey.story.reviewed',jsonb_build_object('key',m.key,'approved',m.story_approved));
   end if;
   result:=jsonb_build_object('milestone',public.ttc_journey_milestone_json(m,(select id from public.ttc_members where slug='alise')));
 end if;
 return result;
end $$;

alter function public.ttc_journey_milestone_json(public.ttc_journey_milestones,uuid) rename to ttc_journey_milestone_json_before_story;
create function public.ttc_journey_milestone_json(m public.ttc_journey_milestones,p_member uuid)
returns jsonb language sql stable set search_path='' as $$
 select public.ttc_journey_milestone_json_before_story(m,p_member)||jsonb_build_object(
 'storyManaged',m.story_managed,'manualOnly',m.manual_only,'storyApproved',m.story_approved,
 'storyDisabled',m.story_disabled,'requiresKeys',m.requires_keys,'storySms',m.story_sms,'storyVaultId',m.story_vault_id)
$$;

-- Independent eligibility is insufficient when a physical act or prior scene is required.
alter function public.ttc_journey_fire(uuid,text,text,jsonb) rename to ttc_journey_fire_before_story;
create function public.ttc_journey_fire(p_member uuid,p_key text,p_via text,p_tpl jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.ttc_journey_milestones; result jsonb; v public.ttc_vaults;
begin
 select * into m from public.ttc_journey_milestones where key=p_key for update;
 if m.key is null then perform public.ttc_fail('not-found'); end if;
 if public.ttc_journey_comms_held() then return jsonb_build_object('key',m.key,'state',m.state,'duplicate',true); end if;
 if m.state='fired' then return jsonb_build_object('key',m.key,'state','fired','duplicate',true); end if;
 if p_via='schedule' and (m.state<>'pending' or m.manual_only) then
   return jsonb_build_object('key',m.key,'state',m.state,'duplicate',true);
 end if;
 begin
   if m.story_managed and p_key='birthday-screening' and now()<'2026-10-24T05:00:00Z'::timestamptz then raise exception 'The birthday screening cannot be invited before midnight Jamaica.'; end if;
   if m.story_disabled then raise exception 'This superseded scene is disabled.'; end if;
   if m.story_managed and not m.story_approved then raise exception 'Review the exact letter, SMS and physical arrangements in the journey desk before approval.'; end if;
   if exists(select 1 from unnest(m.requires_keys) k where not exists(
     select 1 from public.ttc_journey_milestones prior where prior.key=k and prior.state='fired')) then
     raise exception 'The preceding story chapter has not completed. See Required scenes.';
   end if;
   if p_key in ('departure-ugg','departure-airpods') then
     select * into v from public.ttc_vaults where id=m.story_vault_id;
     if v.id is null or v.state not in ('ready','opened') or now()<public.ttc_vault_effective_opens_at(v) then
       raise exception 'Map the physical gift to a ready Vault compartment with its opening time reached.';
     end if;
   end if;
   if p_key='casino-afternoon-spins' and not exists(select 1 from public.ttc_prize_catalogue
     where slug='nyla-film' and active and nullif(video_url,'') is not null) then
     raise exception 'Nyla media must be configured and active before this session.';
   end if;
   if m.story_managed and p_key in ('departure-privileges','airport-drinks','departure-airpods','casino-opening','casino-evening-spins','farewell')
      and nullif(btrim(m.story_sms),'') is null then raise exception 'Supply the exact approved invitation SMS, including its club link.'; end if;
   result:=public.ttc_journey_fire_before_story(p_member,p_key,p_via,p_tpl);
   return result;
 exception when others then
   update public.ttc_journey_milestones set state='failed',attempts=attempts+1,last_error=left(sqlerrm,300),updated_at=now() where key=p_key;
   return jsonb_build_object('key',p_key,'state','failed','duplicate',false);
 end;
end $$;

create or replace function public.ttc_journey_fire_due(p_member uuid,p_tpl jsonb) returns integer
language plpgsql security invoker set search_path='' as $$
declare r record; n integer:=0;
begin
 if public.ttc_journey_comms_held() then return 0; end if;
 for r in select key from public.ttc_journey_milestones where state='pending' and not manual_only and fire_at<=now()
   order by fire_at,sort,key limit 20 for update skip locked loop
   perform public.ttc_journey_fire(p_member,r.key,'schedule',p_tpl); n:=n+1;
 end loop;
 return n;
end $$;

-- SMS-only scenes use the same approved, idempotent SQL outbox and transport policy.
alter function public.ttc_journey_hook(text,jsonb,text) rename to ttc_journey_hook_before_story;
create function public.ttc_journey_hook(p_name text,p_params jsonb,p_idempotency_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.ttc_journey_milestones; mid uuid;
begin
 if p_name='story.sms' then
   select * into m from public.ttc_journey_milestones where key=p_params->>'key';
   if not m.story_approved or nullif(btrim(m.story_sms),'') is null then
     raise exception 'Supply and review the exact SMS before sending this scene.';
   end if;
   insert into public.ttc_messages(seed_key,label,body,category,send_at,timezone,state,approved_at,next_attempt_at)
   values('story:'||m.key,m.title,m.story_sms,'correspondence-alise',now(),m.timezone,'approved',now(),now())
   on conflict(seed_key) do nothing returning id into mid;
   return jsonb_build_object('messageId',mid);
 end if;
 return public.ttc_journey_hook_before_story(p_name,p_params,p_idempotency_key);
end $$;

-- One invitation per scene; silent scenes never gain a generic invitation SMS.
-- Exact chapter SMS replaces the generic invitation atomically before dispatch.
alter function public.ttc_journey_letter(uuid,text,text,text,text,text,jsonb) rename to ttc_journey_letter_before_story;
create function public.ttc_journey_letter(p_member uuid,p_ref text,p_title text,p_body text,p_action_kind text,p_action_room text,p_tpl jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare lid uuid; mid uuid; m public.ttc_journey_milestones;
begin
 lid:=public.ttc_journey_letter_before_story(p_member,p_ref,p_title,p_body,p_action_kind,p_action_room,p_tpl);
 if p_ref like 'milestone:%' then
   select * into m from public.ttc_journey_milestones where key=split_part(p_ref,':',2);
 elsif p_ref like 'admission:screening-room:%' then
   select * into m from public.ttc_journey_milestones where key='birthday-screening';
 elsif p_ref like 'admission:casino:%' then
   select * into m from public.ttc_journey_milestones where key='casino-opening';
 end if;
 if m.story_managed then
   select invitation_message_id into mid from public.ttc_letters where id=lid;
   if nullif(btrim(m.story_sms),'') is null then
     update public.ttc_messages set state='cancelled',approved_at=null,last_error='This story scene has no approved outbound SMS.'
       where id=mid and state in ('approved','draft');
   else
     update public.ttc_messages set body=m.story_sms where id=mid and state in ('approved','draft');
   end if;
 end if;
 return lid;
end $$;

-- New wrappers are service-only, matching the existing API boundary.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like '%before_story' or p.proname in(
 'ttc_journey_action','ttc_journey_milestone_json','ttc_journey_fire','ttc_journey_fire_due','ttc_journey_hook','ttc_journey_letter')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;

-- Exact recovered copy, corrected schedules, and held release controls.
-- Completed milestones are immutable. No spin, voucher, gift or communication is issued here.
update public.ttc_journey_milestones set title='22 Oct — footwear delivery clue',fire_at='2026-10-22T08:00:00Z'::timestamptz,
 effects='[{"type": "hook", "name": "story.sms", "params": {"key": "departure-ugg"}}]'::jsonb, state='held',story_managed=true,
 manual_only=true,story_approved=false,story_disabled=false,
 requires_keys=ARRAY[]::text[],story_sms='Madam,

I have been reviewing the arrangements for your forthcoming journey and have encountered a rather troubling oversight.

Your husband, it seems, has devoted considerable attention to constructing an entire private members'' club, yet I remain unconvinced that he has given sufficient thought to your footwear.

Fortunately, I have taken the liberty of intervening.

A rather special delivery has been secured within the Gift Vault. Regrettably, the key appears to have been misplaced somewhere one might reasonably expect to find a pillow.

Do investigate, Madam. We cannot have the Club''s most distinguished member travelling improperly equipped.',
 description='Manual before packing. NFC by pillow; physical gift in shoe cupboard. Map the real compartment before approving. SMS only; no app link in the original.',updated_at=now()
 where key='departure-ugg' and state<>'fired';
update public.ttc_journey_milestones set title='22 Oct — Your Departure Lounge Awaits',fire_at='2026-10-22T09:00:00Z'::timestamptz,
 effects='[{"type": "letter", "title": "Your Departure Lounge Awaits", "body": "Madam,\n\nI understand that you are presently making your way towards the airport.\n\nHow exciting. Although I must confess, I find the prospect of entrusting one''s luggage to an airline rather unsettling. I much prefer to know precisely who has been handling my belongings.\n\nNevertheless, I have some rather splendid news.\n\nFollowing considerable negotiations, several telephone calls and a modest amount of persuasion, I am delighted to announce that The Thirty Club Departure Lounge is officially open.\n\nNaturally, an establishment of our standing could hardly expect its most distinguished member to endure the indignity of travelling without access to a private lounge.\n\nI have therefore arranged for you to enjoy the exclusive facilities of our newest room.\n\nYou may access the Departure Lounge at any time through the Club Directory. However, as this is your first visit, I would be delighted to escort you there personally.\n\nDo make yourself comfortable, Madam.\n\nI shall be in touch when further arrangements have been made.\n\nYour devoted Butler\nThe Thirty Club"}]'::jsonb, state='held',story_managed=true,
 manual_only=true,story_approved=false,story_disabled=false,
 requires_keys=ARRAY['departure-ugg']::text[],story_sms=null,
 description='Manual en route to airport. Recovered original with confirmed introductory request. Review the later ending note and configure the short direct /departure summons before approval.',updated_at=now()
 where key='departure-privileges' and state<>'fired';
update public.ttc_journey_milestones set title='22 Oct — A Rather Generous Benefactor',fire_at='2026-10-22T12:30:00Z'::timestamptz,
 effects='[{"type": "hook", "name": "drinks.grant", "params": {"kind": "airport", "quantity": 2}}, {"type": "letter", "title": "A Rather Generous Benefactor", "body": "Madam,\n\nI trust you have passed through airport security without incident.\n\nI am pleased to report that, unlike certain members of our Security Department, the airport authorities appear to conduct themselves with a reasonable degree of professionalism.\n\nNow, to business.\n\nA rather generous gentleman has contacted the Club and arranged for you to enjoy two complimentary beverages before your departure.\n\nHe insisted upon remaining anonymous.\n\nUnfortunately, he also insisted that I inform you how extraordinarily thoughtful, handsome and generally magnificent he is.\n\nI fear the gentleman does not entirely understand the concept of anonymity.\n\nNevertheless, I have accepted his generous offer on your behalf.\n\nYou will now find two drinks vouchers waiting within your Privileges Collection.\n\nShould you wish to redeem one, simply ring for my assistance, select your drinks privilege and inform me of your preferred beverage.\n\nI shall see that your request reaches the appropriate gentleman.\n\nI should mention that the gentleman in question has assured me he will attend to your order personally.\n\nQuite remarkable dedication from an anonymous benefactor, wouldn''t you agree?\n\nFor now, Madam, I shall leave you to enjoy your refreshments.\n\nThere is no need to remain at the Club. I shall notify you personally when your presence is required again.\n\nYour devoted Butler\nThe Thirty Club"}]'::jsonb, state='held',story_managed=true,
 manual_only=true,story_approved=false,story_disabled=false,
 requires_keys=ARRAY['departure-privileges']::text[],story_sms=null,
 description='Manual AFTER security, BEFORE gate AirPods. Two paid airport drinks. Approved revised menu instructions and short SMS missing; edit before approval.',updated_at=now()
 where key='airport-drinks' and state<>'fired';
update public.ttc_journey_milestones set title='22 Oct — A Rather Concerning Development',fire_at='2026-10-22T14:00:00Z'::timestamptz,
 effects='[{"type": "letter", "title": "A Rather Concerning Development", "body": "Madam,\n\nI regret to inform you that the situation within our Security Department has escalated considerably.\n\nYou may recall that Miss Nyla recently appointed herself Head of Security following a rather unfortunate incident involving a courier.\n\nWell, it appears she has wasted absolutely no time assembling her own department.\n\nI have received reports that she has recruited a certain gentleman by the name of Albert to serve as her personal assistant.\n\nYes, Madam. That Albert.\n\nQuite what qualifications a stuffed bear possesses in matters of private security is beyond me, but I am assured he has been taking his new responsibilities very seriously.\n\nUnfortunately, the pair have now taken it upon themselves to inspect all incoming deliveries, including one rather important package addressed to you.\n\nThe package has been secured within the Gift Vault. However, its key has gone missing.\n\nFollowing a brief internal investigation, I believe I have identified a promising lead.\n\nYour husband''s bag.\n\nRest assured, Madam, your husband will have absolutely no objection to you examining its contents.\n\nIn fact, I would strongly advise against asking his permission. It would only give him time to interfere with the investigation.\n\nSimply take the bag and investigate.\n\nShould you recover anything of interest, present it using your telephone. I shall handle the rest.\n\nI must say, Madam, I am beginning to lose control of this establishment.\n\nYour increasingly concerned Butler\nThe Thirty Club"}]'::jsonb, state='held',story_managed=true,
 manual_only=true,story_approved=false,story_disabled=false,
 requires_keys=ARRAY['airport-drinks']::text[],story_sms=null,
 description='Manual at the gate. Albert and the NFC key in Arron’s bag. Map the real ready compartment. No gift identity before NFC reveal. Review the summons and handover instruction against the later approval note.',updated_at=now()
 where key='departure-airpods' and state<>'fired';
update public.ttc_journey_milestones set title='22 Oct — A Most Pleasant Flight, Madam',fire_at='2026-10-22T15:50:00Z'::timestamptz,
 effects='[{"type": "hook", "name": "story.sms", "params": {"key": "flight-departure"}}]'::jsonb, state='held',story_managed=true,
 manual_only=false,story_approved=false,story_disabled=false,
 requires_keys=ARRAY['departure-airpods']::text[],story_sms='Madam,

I understand that your departure is now imminent.

I trust your travel arrangements have proceeded smoothly, despite the rather questionable conduct of our Security Department.

I have also been informed that your husband will be accompanying you on this journey.

Naturally, I have taken the liberty of issuing him a few instructions.

He is to ensure your comfort, attend to your every reasonable request, and conduct himself with the dignity befitting the husband of a distinguished Club member.

I am, however, reliably informed that the gentleman has a rather remarkable ability to overindulge in the Devil''s Nectar.

Should you find him three drinks deep, enthusiastically recounting his life story to the flight attendants, please rest assured that this is apparently perfectly normal behaviour.

I have considered contacting the airline to warn them in advance, but I fear it may be too late.

Nevertheless, I have every confidence that you shall both have a wonderful journey.

For now, Madam, please put your telephone away and enjoy your flight.

I shall notify you when your presence is required again.

Until Jamaica.

Your devoted Butler
The Thirty Club',
 description='Review recovered Story Bible copy, SMS, timing and real-world arrangements before release.',updated_at=now()
 where key='flight-departure' and state<>'fired';
update public.ttc_journey_milestones set title='22 Oct — Jamaica arrival',fire_at='2026-10-23T02:30:00Z'::timestamptz,
 effects='[{"type": "hook", "name": "story.sms", "params": {"key": "jamaica-arrival"}}]'::jsonb, state='held',story_managed=true,
 manual_only=false,story_approved=false,story_disabled=false,
 requires_keys=ARRAY['flight-departure']::text[],story_sms='The Thirty Club — Your Butler

Madam,

Jamaica. Good heavens.

I have been here approximately twenty minutes, and my waistcoat has already become a matter of considerable regret.

Yes, Madam. I have accompanied you across the Atlantic. An establishment of our standing simply cannot abandon its most distinguished member on foreign soil.

Particularly given the troubling intelligence I have received regarding your husband''s first-night holiday traditions.

Apparently, the gentleman has a remarkable ability to consume quantities of the Devil''s Nectar that would concern even the most seasoned publican.

I am told that by sunset, he may be in absolutely no condition to provide meaningful assistance whatsoever.

Naturally, I have made contingency arrangements.

And speaking of arrangements, I have been rather busy preparing for a certain upcoming occasion.

There are still doors within The Thirty Club that you have yet to discover, Madam. All in good time.

For now, enjoy Jamaica, keep a watchful eye on your husband, and leave the preparations to me.

I shall notify you when your presence is required again.

Your devoted, considerably overheated Butler.',
 description='21:30 Jamaica. SMS ONLY. Recovered document wording retained for review against the later shortening note.',updated_at=now()
 where key='jamaica-arrival' and state<>'fired';
update public.ttc_journey_milestones set title='23 Oct — Morning three spins',fire_at='2026-10-23T14:00:00Z'::timestamptz,
 effects='[{"type": "hook", "name": "casino.spins.issue", "params": {"quantity": 3, "prizeSlugs": ["jamaica-drinks"], "prizePositions": [3], "announce": false}}]'::jsonb, state='held',story_managed=true,
 manual_only=false,story_approved=false,story_disabled=false,
 requires_keys=ARRAY['early-membership']::text[],story_sms=null,
 description='Review recovered Story Bible copy, SMS, timing and real-world arrangements before release.',updated_at=now()
 where key='casino-opening-spins' and state<>'fired';
update public.ttc_journey_milestones set sort=49 where key='casino-opening-spins' and state<>'fired';
update public.ttc_journey_milestones set title='23 Oct — An Invitation of Considerable Importance',fire_at='2026-10-23T14:00:00Z'::timestamptz,
 effects='[{"type": "invite-room", "room": "casino"}]'::jsonb, state='held',story_managed=true,
 manual_only=false,story_approved=false,story_disabled=false,
 requires_keys=ARRAY['casino-opening-spins']::text[],story_sms=null,
 description='09:00 Jamaica. Invitation requires opening spins actually issued. Review and configure the brief summons SMS before approval.',updated_at=now()
 where key='casino-opening' and state<>'fired';
update public.ttc_journey_milestones set title='23 Oct — Three spins: Nyla on the third',fire_at='2026-10-23T19:30:00Z'::timestamptz,
 effects='[{"type": "hook", "name": "casino.spins.issue", "params": {"quantity": 3, "prizeSlugs": ["nyla-film"], "prizePositions": [3], "announce": false}}, {"type": "hook", "name": "story.sms", "params": {"key": "casino-afternoon-spins"}}]'::jsonb, state='held',story_managed=true,
 manual_only=false,story_approved=false,story_disabled=false,
 requires_keys=ARRAY['casino-opening']::text[],story_sms=null,
 description='14:30 Jamaica. Configure Nyla film through the separate media workstream. Review and configure the return-to-Casino SMS. Film is won only on this session’s third spin; this letter must be presented with the prize, not before it.',updated_at=now()
 where key='casino-afternoon-spins' and state<>'fired';
update public.ttc_journey_milestones set title='23 Oct — One Final Roll of the Dice',fire_at='2026-10-24T01:30:00Z'::timestamptz,
 effects='[{"type": "hook", "name": "casino.spins.issue", "params": {"quantity": 3, "prizeSlugs": ["evening-jackpot"], "prizePositions": [3], "announce": false}}, {"type": "letter", "title": "One Final Roll of the Dice", "body": "Madam,\n\nI do hope you have been enjoying your evening.\n\nI am pleased to report that our Head of Security remains occupied with her investigation into the disappearance of Deputy Albert.\n\nI fear the gentleman may have some explaining to do upon his return.\n\nHowever, I have rather more exciting news.\n\nThe Grand Casino has requested your presence for one final engagement.\n\nIt appears that your continued enthusiasm for our gaming facilities has not gone unnoticed.\n\nManagement has therefore authorised three final complimentary spins upon our slot machine.\n\nNaturally, I cannot make any guarantees regarding the outcome. The house does, after all, have a reputation to maintain.\n\nNevertheless, I do hope you will enjoy one final visit.\n\nThe Grand Casino awaits, Madam.\n\nYour devoted Butler\nThe Thirty Club", "action": {"kind": "return", "room": "casino"}}]'::jsonb, state='held',story_managed=true,
 manual_only=false,story_approved=false,story_disabled=false,
 requires_keys=ARRAY['casino-afternoon-spins']::text[],story_sms=null,
 description='20:30 Jamaica. Three spins; third wins mystery. Configure distinct physical NFC and breakfast Vault compartment; do not name breakfast before its key opens it. Review and configure the return SMS.',updated_at=now()
 where key='casino-evening-spins' and state<>'fired';
update public.ttc_journey_milestones set title='Superseded evening notice',fire_at='2026-10-24T01:30:00Z'::timestamptz,
 effects='[{"type": "hook", "name": "story.disabled", "params": {}}]'::jsonb, state='held',story_managed=true,
 manual_only=false,story_approved=false,story_disabled=true,
 requires_keys=ARRAY[]::text[],story_sms=null,
 description='Superseded by casino-evening-spins. Disabled to prevent duplicate invitations.',updated_at=now()
 where key='casino-evening-mystery' and state<>'fired';
update public.ttc_journey_milestones set title='24 Oct — The Reason for It All',fire_at='2026-10-24T05:00:00Z'::timestamptz,
 effects='[{"type": "invite-room", "room": "screening-room"}]'::jsonb, state='held',story_managed=true,
 manual_only=false,story_approved=false,story_disabled=false,
 requires_keys=ARRAY['early-membership']::text[],story_sms='The Thirty Club — Your Butler

Madam,

The clock has struck twelve.

And so, at long last, the occasion for which this establishment was created has arrived.

There is something rather special awaiting you within the Club.

I would ask that you join me when you have a quiet moment. Some occasions deserve our undivided attention.

And, Madam…

A very happy 30th birthday.

Your devoted Butler

https://30.ag14.co/lounge',
 description='Review recovered Story Bible copy, SMS, timing and real-world arrangements before release.',updated_at=now()
 where key='birthday-screening' and state<>'fired';
update public.ttc_journey_milestones set title='Superseded extra midnight letter',fire_at='2026-10-24T05:00:00Z'::timestamptz,
 effects='[{"type": "hook", "name": "story.disabled", "params": {}}]'::jsonb, state='held',story_managed=true,
 manual_only=false,story_approved=false,story_disabled=true,
 requires_keys=ARRAY[]::text[],story_sms=null,
 description='One midnight invitation is owned by birthday-screening. Disabled to prevent duplicate birthday summons.',updated_at=now()
 where key='birthday-midnight-letter' and state<>'fired';
update public.ttc_journey_milestones set title='No automatic birthday Vault invitation',fire_at='2026-10-24T05:00:00Z'::timestamptz,
 effects='[{"type": "hook", "name": "story.disabled", "params": {}}]'::jsonb, state='held',story_managed=true,
 manual_only=false,story_approved=false,story_disabled=true,
 requires_keys=ARRAY[]::text[],story_sms=null,
 description='Vault reveals follow earned gifts and physical NFC; no unrelated automatic midnight gift reveal.',updated_at=now()
 where key='birthday-vault' and state<>'fired';
update public.ttc_journey_milestones set title='24 Oct — Breakfast has physically arrived',fire_at='2026-10-24T15:30:00Z'::timestamptz,
 effects='[{"type": "hook", "name": "story.sms", "params": {"key": "birthday-breakfast"}}]'::jsonb, state='held',story_managed=true,
 manual_only=true,story_approved=false,story_disabled=false,
 requires_keys=ARRAY[]::text[],story_sms='The Thirty Club — Your Butler

Good morning, Madam.

I trust you enjoyed last night''s celebrations.

I am delighted to inform you that your Birthday Breakfast in Bed has now arrived.

Naturally, I have personally overseen the arrangements.

Your husband has been instructed to ensure that you are treated with the utmost care and attention.

Should the service fall below expectations, please do not hesitate to inform me.

Bon appétit, Madam.

Your devoted Butler',
 description='MANUAL ONLY after food is physically present. Cannot Resume or schedule. Breakfast must have been earned and arranged.',updated_at=now()
 where key='birthday-breakfast' and state<>'fired';
update public.ttc_journey_milestones set title='Private NFC birthday card: no Butler message',fire_at='2026-10-24T16:00:00Z'::timestamptz,
 effects='[{"type": "hook", "name": "story.disabled", "params": {}}]'::jsonb, state='held',story_managed=true,
 manual_only=false,story_approved=false,story_disabled=true,
 requires_keys=ARRAY[]::text[],story_sms=null,
 description='No SMS or letter. Give physical card linking to /birthdaycard; edit personal message in Birthday card desk.',updated_at=now()
 where key='birthday-card' and state<>'fired';
update public.ttc_journey_milestones set title='24 Oct — A Matter of Considerable Importance',fire_at='2026-10-24T21:00:00Z'::timestamptz,
 effects='[{"type": "letter", "title": "A Matter of Considerable Importance", "body": "Madam,\n\nFirstly, I trust you are enjoying your birthday.\n\nNow, I must address a rather delicate matter.\n\nAs we have discovered over the years, your husband has an extraordinarily unfortunate habit of behaving as though your birthday is, in fact, HIS birthday.\n\nI have reviewed the gentleman''s previous conduct and, frankly, the evidence is overwhelming.\n\nHis enthusiasm for celebrating himself is matched only by his enthusiasm for the Devil''s Nectar.\n\nConsequently, I have reached a rather difficult decision.\n\nI simply cannot trust the man to organise your birthday celebrations.\n\nI have therefore taken matters into my own hands.\n\nIt gives me great pleasure to inform you that I have personally arranged a Luxury Birthday Dinner, in your honour, this evening at 7:30 PM.\n\nNaturally, a lady of your standing must be afforded adequate time to prepare.\n\nI would therefore suggest returning to your private quarters at approximately 5:00 PM, where you may relax, refresh yourself, and prepare for an evening befitting your status.\n\nYour husband has been instructed to present himself at 7:00 PM sharp, suitably dressed and, preferably, sober enough to remember whose birthday it is.\n\nAfter all, Madam, one does not turn thirty every day.\n\nHappy Womb Independence Day.\n\nI do hope the gentleman manages to behave himself.\n\nYour devoted, increasingly concerned Butler\nThe Thirty Club"}]'::jsonb, state='held',story_managed=true,
 manual_only=false,story_approved=false,story_disabled=false,
 requires_keys=ARRAY['birthday-screening']::text[],story_sms='The Thirty Club — Your Butler

Madam,

I regret to inform you that I have lost all confidence in your husband''s ability to organise your birthday.

Fortunately, I have taken the liberty of intervening.

Please visit the Members'' Lounge at your convenience. I have some rather important arrangements to discuss.

Your devoted Butler

https://30.ag14.co/lounge',
 description='16:00 Jamaica. Dinner 19:30; return 17:00; escort 19:00. Confirm actual dinner and suite arrangements. Send Now and scheduler share the same idempotent milestone.',updated_at=now()
 where key='birthday-dinner' and state<>'fired';
update public.ttc_journey_milestones set title='25 Oct — Your devoted Butler',fire_at='2026-10-25T23:00:00Z'::timestamptz,
 effects='[{"type": "letter", "title": "Your devoted Butler", "body": "As for myself, I shall remain at your service.\n\nAlthough I do intend to submit a formal request for annual leave.\n\nI suspect Miss Nyla will reject it.\n\nHappy 30th Birthday, Madam.\n\nMay this next chapter of your life be your most wonderful yet.\n\nForever your devoted Butler\nThe Thirty Club"}]'::jsonb, state='held',story_managed=true,
 manual_only=true,story_approved=false,story_disabled=false,
 requires_keys=ARRAY['birthday-dinner']::text[],story_sms=null,
 description='Exact approved closing only. No excursion promise. Time was never approved: manual only. Full no-excursion introduction and short invitation SMS require editorial review.',updated_at=now()
 where key='farewell' and state<>'fired';

-- The required first Departure Lounge request uses the existing real request/SMS flow.
create table public.ttc_departure_introduction (
 member_id uuid primary key references public.ttc_members(id),
 request_id uuid not null references public.ttc_letter_replies(id),
 created_at timestamptz not null default now()
);
alter table public.ttc_departure_introduction enable row level security;
revoke all on public.ttc_departure_introduction from public,anon,authenticated;
grant all on public.ttc_departure_introduction to service_role;
create policy service_only on public.ttc_departure_introduction for all to service_role using(true) with check(true);

alter function public.ttc_service_action(uuid,text,text,jsonb) rename to ttc_service_action_before_story;
create function public.ttc_service_action(p_actor uuid,p_role text,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_action='service-request' and p_input->>'purpose'='departure-introduction' and not exists(
   select 1 from public.ttc_journey_milestones where key='departure-privileges' and state='fired') then
   perform public.ttc_fail('not-open');
 end if;
 result:=public.ttc_service_action_before_story(p_actor,p_role,p_action,p_input);
 if p_action='service-request' and p_input->>'purpose'='departure-introduction' then
   insert into public.ttc_departure_introduction(member_id,request_id)
   values(p_actor,(result->'request'->>'id')::uuid) on conflict(member_id) do nothing;
 end if;
 return result;
end $$;
revoke all on function public.ttc_service_action(uuid,text,text,jsonb),public.ttc_service_action_before_story(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ttc_service_action(uuid,text,text,jsonb),public.ttc_service_action_before_story(uuid,text,text,jsonb) to service_role;

-- Prize presentation is an immutable snapshot. Film playback remains owned
-- by the separate media branch; this only supplies the recovered narrative.
alter function public.ttc_casino_prize_snapshot(public.ttc_prize_catalogue) rename to ttc_casino_prize_snapshot_before_story;
create function public.ttc_casino_prize_snapshot(p public.ttc_prize_catalogue) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
 result:=public.ttc_casino_prize_snapshot_before_story(p);
 if p.slug='nyla-film' then result:=result||jsonb_build_object('presentation','Madam,

Well, this is quite extraordinary.

It appears your latest victory has attracted the attention of a particularly senior member of our establishment.

Our Head of Security, Miss Nyla, has requested an urgent audience with you.

I must confess, Madam, she has been rather difficult to manage in your absence.

She has conducted several inspections of your usual sleeping arrangements, repeatedly questioned the whereabouts of her mother, and informed me that the entire household is now under her personal supervision.

To make matters worse, her Deputy Head of Security, Albert, has also gone missing.

Quite how one manages to misplace a stuffed bear entrusted with matters of national importance is beyond me.

Miss Nyla has launched a full investigation.

I have considered informing her that Albert was last seen in the company of your husband, but I fear this may only complicate matters.

Nevertheless, despite these rather troubling developments, Miss Nyla has insisted that I deliver a personal message to you.

And given her position within the Club, I felt it unwise to refuse.

I believe this one may be rather special, Madam.

Your devoted Butler
The Thirty Club'); end if;
 if p.slug='evening-jackpot' then result:=result||jsonb_build_object('title','Mystery Prize','description','777 Mystery Jackpot','presentation','MADAM!

GOOD HEAVENS!

SEVEN! SEVEN! SEVEN!

A JACKPOT!

I must confess, I was not expecting that.

The Casino Manager has just informed me that you have won our rather elusive MYSTERY PRIZE!

Naturally, the contents must remain a secret until you have officially claimed your winnings.

Your prize has now been secured within The Gift Vault, awaiting your collection.

There is, however, one small complication.

The Vault requires a special key, and I am afraid I cannot simply hand it to you.

I can, however, offer a little assistance.

Your clue:

“Some treasures travel far without ever leaving your side. Seek where the little things you carry like to hide.”

Once you have discovered the key, present it using your telephone and I shall arrange access to your prize.

I shall await your return, Madam.

And once again, congratulations on your extraordinary victory!

Your thoroughly astonished Butler
The Thirty Club','instructions','','imageUrl',null); end if;
 return result;
end $$;
revoke all on function public.ttc_casino_prize_snapshot(public.ttc_prize_catalogue),public.ttc_casino_prize_snapshot_before_story(public.ttc_prize_catalogue) from public,anon,authenticated;
grant execute on function public.ttc_casino_prize_snapshot(public.ttc_prize_catalogue),public.ttc_casino_prize_snapshot_before_story(public.ttc_prize_catalogue) to service_role;

-- Known story prizes are presented in the Casino, with no duplicate mail/SMS
-- before CLAIM or the physical key. Other owner-issued rewards are unchanged.
create function public.ttc_story_prize_event() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.source='casino' and new.type in ('reward.voucher.issued','vault.gift.unlocked') and exists(
   select 1 from public.ttc_reward_entitlements e
   where (e.id::text=new.payload->>'voucherId' or e.vault_id::text=new.payload->>'vaultId')
     and e.snapshot->>'slug' in ('jamaica-drinks','nyla-film','evening-jackpot')) then
   new.payload:=new.payload||jsonb_build_object('announce',false);
 end if;
 return new;
end $$;
create trigger ttc_story_prize_event before insert on public.ttc_journey_events
 for each row execute function public.ttc_story_prize_event();
revoke all on function public.ttc_story_prize_event() from public,anon,authenticated;
grant execute on function public.ttc_story_prize_event() to service_role;

-- Rehearsal must use precisely the SMS reviewed for this story scene, including
-- SMS-only hooks. Do not fall back to the generic room-invitation template.
alter function public.ttc_sms_action(uuid,text,text,jsonb) rename to ttc_sms_action_before_story;
create function public.ttc_sms_action(p_actor uuid,p_role text,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.ttc_journey_milestones;
begin
 if p_action='owner-sms-rehearsal-source' and p_input->>'kind'='milestone' then
   if p_role is distinct from 'owner' then perform public.ttc_fail('forbidden'); end if;
   select * into m from public.ttc_journey_milestones where key=p_input->>'id';
   if m.story_managed then
     if nullif(btrim(m.story_sms),'') is null then perform public.ttc_fail('invalid'); end if;
     return jsonb_build_object('liveBody',m.story_sms,'sendAt',m.fire_at);
   end if;
 end if;
 return public.ttc_sms_action_before_story(p_actor,p_role,p_action,p_input);
end $$;
revoke all on function public.ttc_sms_action(uuid,text,text,jsonb),public.ttc_sms_action_before_story(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ttc_sms_action(uuid,text,text,jsonb),public.ttc_sms_action_before_story(uuid,text,text,jsonb) to service_role;
