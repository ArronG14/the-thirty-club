-- READ ONLY. Store the result privately before/after the single approved
-- migration. It contains IDs and hashes, never bearer codes, bodies or phones.
-- Do not restore these rows over LIVE: this is comparison evidence only.
select jsonb_build_object(
 'admissions',coalesce((select jsonb_agg(jsonb_build_object('memberId',member_id,'room',room_id,'state',state,'admittedAt',admitted_at) order by member_id,room_id) from public.ttc_room_admissions),'[]'::jsonb),
 'membershipCards',coalesce((select jsonb_agg(jsonb_build_object('memberId',member_id,'firstPresentedAt',first_presented_at,'lastPresentedAt',last_presented_at,'presentations',presentations) order by member_id) from public.ttc_membership_card),'[]'::jsonb),
 'firedMilestones',coalesce((select jsonb_agg(jsonb_build_object('key',key,'state',state,'firedAt',fired_at,'effectsHash',md5(effects::text)) order by key) from public.ttc_journey_milestones where state='fired'),'[]'::jsonb),
 'letters',coalesce((select jsonb_agg(jsonb_build_object('id',id,'state',state,'openedAt',opened_at,'bodyHash',md5(body)) order by id) from public.ttc_letters),'[]'::jsonb),
 'messages',coalesce((select jsonb_agg(jsonb_build_object('id',id,'state',state,'bodyHash',md5(body)) order by id) from public.ttc_messages),'[]'::jsonb),
 'casinoBatches',coalesce((select jsonb_agg(jsonb_build_object('id',id,'quantity',quantity,'nextPosition',next_position,'status',status) order by id) from public.ttc_casino_batches),'[]'::jsonb),
 'casinoSpins',coalesce((select jsonb_agg(jsonb_build_object('id',id,'batchId',batch_id,'position',position,'snapshotHash',md5(coalesce(prize_snapshot::text,''))) order by id) from public.ttc_casino_spins),'[]'::jsonb),
 'entitlements',coalesce((select jsonb_agg(jsonb_build_object('id',id,'spinId',spin_id,'state',state,'snapshotHash',md5(snapshot::text)) order by id) from public.ttc_reward_entitlements),'[]'::jsonb),
 'vaults',coalesce((select jsonb_agg(jsonb_build_object('id',id,'number',display_number,'state',state,'openedAt',opened_at) order by id) from public.ttc_vaults),'[]'::jsonb),
 'drinksGranted',coalesce((select jsonb_agg(jsonb_build_object('id',id,'rowHash',md5(row_to_json(g)::text)) order by id) from public.ttc_drink_grants g),'[]'::jsonb),
 'drinksRequested',coalesce((select jsonb_agg(jsonb_build_object('id',id,'rowHash',md5(row_to_json(r)::text)) order by id) from public.ttc_drink_requests r),'[]'::jsonb),
 'holdActive',(select active from public.ttc_communication_hold limit 1),
 'smsMode',(select mode from public.ttc_sms_operations limit 1)
) as protected_progress;
