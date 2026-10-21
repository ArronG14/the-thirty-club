-- READ ONLY, after the story migration and approved configuration operations.
-- Every row must pass; this does not replace the R2, phone or physical checks.
-- No bearer codes, personal message, SMS body or phone number is returned.
with intended(key) as (values
 ('departure-ugg'),('departure-privileges'),('airport-drinks'),('departure-airpods'),
 ('flight-departure'),('jamaica-arrival'),('casino-opening-spins'),('casino-opening'),
 ('casino-afternoon-spins'),('casino-evening-spins'),('birthday-screening'),
 ('birthday-breakfast'),('birthday-dinner'),('farewell')),
issues as (
 select m.key,m.fire_at,m.timezone,e from public.ttc_journey_milestones m
 cross join lateral jsonb_array_elements(m.effects) e
 where e->>'type'='hook' and e->>'name'='casino.spins.issue'
)
select 'CFG01' check_id,
 (select count(distinct v.id)=2 and bool_and(v.state in ('ready','opened') and length(btrim(v.gift_location))>0 and v.gift_location !~* '^TEST')
 from public.ttc_journey_milestones m join public.ttc_vaults v on v.id=m.story_vault_id
 where m.key in ('departure-ugg','departure-airpods')) passed,
 'Two distinct real UGG/AirPods compartments bound and ready; physical placement separately confirmed.' detail
union all select 'CFG02', exists(
 select 1 from public.ttc_prize_catalogue p join public.ttc_vaults v on v.id=p.vault_id
 where p.slug='evening-jackpot' and p.active and p.kind='VAULT_GIFT'
 and v.trigger='casino' and v.casino_reward_id='casino.evening-jackpot'
 and v.opens_at<='2026-10-24T01:30:00Z'::timestamptz
 and v.gift_location !~* '^TEST' and length(btrim(v.gift_location))>0
 and (v.state='locked' or exists(select 1 from public.ttc_reward_entitlements e where e.vault_id=v.id))),
 'Active mystery prize linked to the distinct story Casino drawer; not manually readied before the win.'
union all select 'CFG03', exists(select 1 from public.ttc_prize_catalogue where slug='nyla-film' and active and video_url='/api/v1/media/nyla-film'),
 'Nyla uses the protected reference, not an expiring signed URL. Actual storage playback is a separate gate.'
union all select 'CFG04', exists(select 1 from public.ttc_birthday_card where length(btrim(message))>0 and message !~* '^(TEST|Rehearsal card)' and opens_at='2026-10-24T05:00:00Z'::timestamptz),
 'Real personal card text and Jamaica-midnight date; no test placeholder.'
union all select 'CFG05', not exists(select 1 from intended i left join public.ttc_journey_milestones m on m.key=i.key where m.key is null or (m.state<>'fired' and not m.story_approved)),
 'Every intended unfired chapter explicitly reviewed; edits clear approval.'
union all select 'CFG06', not exists(select 1 from public.ttc_journey_milestones where key in
 ('departure-privileges','airport-drinks','departure-airpods','casino-opening','casino-afternoon-spins','casino-evening-spins','farewell','birthday-screening','birthday-dinner')
 and state<>'fired' and (coalesce(story_sms,'') not like '%https://30.ag14.co%' or story_sms ~* '^(TEST|REHEARSAL)')),
 'All app summons have reviewed real text and a club link; flight/arrival/breakfast are SMS-only exceptions.'
union all select 'CFG07', not exists(select 1 from public.ttc_journey_milestones where key in
 ('birthday-vault','birthday-midnight-letter','birthday-card','casino-evening-mystery') and state<>'fired' and (not story_disabled or state<>'held')),
 'Superseded unfired scenes disabled and held; no midnight Vault/card notice.'
union all select 'CFG08', (select count(*)=3 and coalesce(bool_and(
 (e->'params'->>'quantity')::integer=3 and e->'params'->'prizePositions'='[3]'::jsonb and timezone='America/Jamaica'
 and case key
 when 'casino-opening-spins' then fire_at='2026-10-23T14:00:00Z'::timestamptz and e->'params'->'prizeSlugs'='["jamaica-drinks"]'::jsonb
 when 'casino-afternoon-spins' then fire_at='2026-10-23T19:30:00Z'::timestamptz and e->'params'->'prizeSlugs'='["nyla-film"]'::jsonb
 when 'casino-evening-spins' then fire_at='2026-10-24T01:30:00Z'::timestamptz and e->'params'->'prizeSlugs'='["evening-jackpot"]'::jsonb
 else false end),false) from issues),
 'Exactly nine planned spins: three each at 09:00/14:30/20:30 Jamaica, one correct prize at position three.'
union all select 'CFG09', (select count(*)=6 and bool_and(manual_only) from public.ttc_journey_milestones where key in
 ('departure-ugg','departure-privileges','airport-drinks','departure-airpods','birthday-breakfast','farewell')),
 'All physical/manual chapters remain manual; owner arming does not invent a clock time.'
union all select 'CFG10', (select count(*)=2 and bool_and(case key
 when 'flight-departure' then fire_at='2026-10-22T15:50:00Z'::timestamptz and timezone='Europe/London'
 when 'jamaica-arrival' then fire_at='2026-10-23T02:30:00Z'::timestamptz and timezone='America/Jamaica' else false end)
 from public.ttc_journey_milestones where key in ('flight-departure','jamaica-arrival')),
 'Flight 16:50 UK and arrival 21:30 Jamaica; both SMS-only effects verified by acceptance.'
union all select 'CFG11', (select count(*)=2 and bool_and(timezone='America/Jamaica' and case key
 when 'birthday-screening' then fire_at='2026-10-24T05:00:00Z'::timestamptz
 when 'birthday-dinner' then fire_at='2026-10-24T21:00:00Z'::timestamptz else false end)
 from public.ttc_journey_milestones where key in ('birthday-screening','birthday-dinner')),
 'One optional midnight screening invitation and the 16:00 Jamaica dinner letter.'
order by check_id;
