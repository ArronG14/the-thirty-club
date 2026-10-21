/** Synthetic setup in disposable PGlite ONLY. No HTTP, env secrets or provider. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { rpcFor } from '../../netlify/backend/database';
import { withJourneyTemplates } from '../../netlify/backend/journey';
import { STORY_COPY } from '../../src/shared/story/copy';

export async function configureLocalCandidate(pg: PGlite) {
  const owner = async <T = Record<string, unknown>>(
    action: string,
    input: Record<string, unknown> = {},
  ): Promise<T> => {
    try {
      return (
        await pg.query<{ result: T }>(
          `select public.${rpcFor(action)}(null,'owner',$1,$2::jsonb) result`,
          [
            action,
            JSON.stringify(
              action.includes('journey') ? withJourneyTemplates(input) : input,
            ),
          ],
        )
      ).rows[0]!.result;
    } catch (error) {
      throw new Error(`TEST configuration action ${action} failed`, {
        cause: error,
      });
    }
  };
  const protectedTables = [
    'ttc_room_admissions',
    'ttc_membership_card',
    'ttc_casino_batches',
    'ttc_casino_spins',
    'ttc_reward_entitlements',
    'ttc_messages',
    'ttc_letters',
  ];
  const protectedState = async () =>
    Promise.all(
      protectedTables.map(
        async (table) =>
          (await pg.query(`select * from public.${table} order by 1`)).rows,
      ),
    );
  const before = await protectedState();
  const hash = (text: string) =>
    createHash('sha256').update(text).digest('hex');
  const drawers: string[] = [];
  for (const [i, location] of [
    STORY_COPY.uggReveal,
    'TEST ONLY: AirPods are held by your husband; ask him to hand over the present.',
    'TEST ONLY: Birthday Breakfast in Bed, 24 October at 10:30 Jamaica.',
  ].entries()) {
    const token = String.fromCharCode(65 + i).repeat(43);
    const code = `TEST-000${i + 1}-ONLY`;
    const result = await owner<{ vault: { id: string } }>(
      'owner-vault-create',
      {
        displayNumber: 901 + i,
        clue: 'TEST ONLY — synthetic acceptance fixture',
        giftLocation: location,
        trigger: i === 2 ? 'casino' : 'manual',
        availableAt: null,
        casinoRewardId: i === 2 ? 'casino.evening-jackpot' : null,
        opensAt: '2026-10-22T00:00:00Z',
        nfcToken: token,
        nfcTokenHash: hash(token),
        backupCode: code,
        backupCodeHash: hash(code),
      },
    );
    drawers.push(result.vault.id);
    if (i < 2) await owner('owner-vault-ready', { id: result.vault.id });
  }
  await owner<{ prize: { id: string } }>('owner-casino-prize-create', {
    slug: 'evening-jackpot',
    title: 'A Most Extraordinary Victory!',
    description: '777 Mystery Jackpot',
    presentation: STORY_COPY.jackpot,
    kind: 'VAULT_GIFT',
    vaultId: drawers[2],
    active: true,
    ownerNotes: 'TEST ONLY — no physical mapping approved',
    instructions: '',
    imageUrl: null,
    validUntil: null,
  });
  await owner('owner-vault-update', {
    id: drawers[2],
    displayNumber: 903,
    clue: 'TEST ONLY — synthetic acceptance fixture',
    giftLocation:
      'TEST ONLY: Birthday Breakfast in Bed, 24 October at 10:30 Jamaica.',
    trigger: 'casino',
    availableAt: null,
    casinoRewardId: 'casino.evening-jackpot',
    opensAt: '2026-10-24T01:30:00Z',
  });
  const prizes = await owner<{ prizes: Record<string, unknown>[] }>(
    'owner-casino-prizes',
  );
  const nyla = prizes.prizes.find((p) => p.slug === 'nyla-film')!;
  await owner('owner-casino-prize-update', {
    ...nyla,
    id: nyla.id,
    active: true,
    videoUrl: '/api/v1/media/nyla-film',
  });
  await owner('owner-card-save', {
    message: 'TEST ONLY — personal message not supplied.',
    signature: 'TEST ONLY',
    opensAt: '2026-10-24T05:00:00Z',
  });
  for (const [i, key] of ['departure-ugg', 'departure-airpods'].entries())
    await owner('owner-journey-milestone-update', {
      key,
      storyVaultId: drawers[i],
    });
  // Configuration must not admit the member, spend a spin, reveal a gift,
  // approve/fire a chapter, publish a letter or queue an SMS.
  assert.deepEqual(await protectedState(), before);
  const states = (
    await pg.query<{ state: string }>(
      'select state from public.ttc_vaults order by display_number',
    )
  ).rows;
  const readiness = (
    await pg.query<{ check_id: string; passed: boolean }>(
      readFileSync('docs/release/configuration-readiness.sql', 'utf8'),
    )
  ).rows;
  assert.equal(readiness.length, 11);
  assert.equal(readiness.find((r) => r.check_id === 'CFG03')?.passed, true);
  assert.equal(
    readiness.find((r) => r.check_id === 'CFG04')?.passed,
    false,
    'A TEST card must not pass the LIVE release gate',
  );
  assert.equal(
    readiness.find((r) => r.check_id === 'CFG05')?.passed,
    false,
    'TEST setup must not approve the story',
  );
  assert.deepEqual(
    states.map((v) => v.state),
    ['ready', 'ready', 'locked'],
  );
}
