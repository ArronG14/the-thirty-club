import { BackendError, type Database } from './database.ts';
import * as v from './validation.ts';
import type { Session } from '../../src/shared/concierge/types.ts';

interface Context {
  route: string;
  path: string;
  body: Record<string, unknown>;
  session: Session;
  db: Database;
}

/** All reward mutations run in one PostgreSQL RPC transaction. */
export async function casinoRoute({ route, path, body, session, db }: Context) {
  const call = <T = Record<string, unknown>>(
    action: string,
    input: Record<string, unknown> = {},
  ) => db.action<T>(session.memberId, session.role, action, input);
  const owner = route.includes(' /owner/');
  if (owner && session.role !== 'owner') throw new BackendError('forbidden');
  if (!owner && session.role !== 'member') throw new BackendError('forbidden');

  if (route === 'GET /casino') return { data: await call('casino-status') };
  if (route === 'POST /casino/spins') {
    v.keys(body, ['idempotencyKey']);
    v.idempotency(body.idempotencyKey);
    const data = await call<{ duplicate: boolean }>('casino-spin', body);
    return { data, status: data.duplicate ? 200 : 201 };
  }
  if (route === 'GET /vouchers') return { data: await call('voucher-list') };
  if (route === 'POST /vouchers/request') {
    v.keys(body, ['id']);
    v.uuid(body.id);
    const data = await call<{ duplicate: boolean }>('voucher-request', body);
    return { data, status: data.duplicate ? 200 : 201 };
  }
  if (route === 'GET /owner/casino/prizes')
    return { data: await call('owner-casino-prizes') };
  if (
    route === 'POST /owner/casino/prizes' ||
    /^PATCH \/owner\/casino\/prizes\/[^/]+$/.test(route)
  ) {
    v.keys(body, [
      'title',
      'description',
      'presentation',
      'kind',
      'imageUrl',
      'instructions',
      'validUntil',
      'active',
      'ownerNotes',
      'vaultId',
    ]);
    if (
      typeof body.title !== 'string' ||
      body.title.trim().length < 1 ||
      body.title.length > 100
    )
      v.invalid();
    if (body.kind !== 'VOUCHER' && body.kind !== 'VAULT_GIFT') v.invalid();
    if (typeof body.active !== 'boolean') v.invalid();
    if (
      body.imageUrl != null &&
      (typeof body.imageUrl !== 'string' ||
        (!body.imageUrl.startsWith('/') &&
          !body.imageUrl.startsWith('https://')))
    )
      v.invalid();
    if (body.validUntil != null) v.instant(body.validUntil);
    if (body.vaultId != null) v.uuid(body.vaultId);
    const update = route.startsWith('PATCH ');
    const data = await call(
      update ? 'owner-casino-prize-update' : 'owner-casino-prize-create',
      {
        ...body,
        ...(update ? { id: v.uuid(path.split('/')[4]) } : {}),
      },
    );
    return { data, status: update ? 200 : 201 };
  }
  if (route === 'GET /owner/casino/batches')
    return { data: await call('owner-casino-batches') };
  if (route === 'POST /owner/casino/batches') {
    v.keys(body, ['quantity', 'prizeIds', 'idempotencyKey', 'announce']);
    v.integer(body.quantity);
    if (!Array.isArray(body.prizeIds) || body.prizeIds.length > 50) v.invalid();
    body.prizeIds.forEach((id) => v.uuid(id));
    v.idempotency(body.idempotencyKey);
    if (body.announce !== undefined && typeof body.announce !== 'boolean')
      v.invalid();
    const data = await call<{ duplicate: boolean }>('owner-casino-issue', body);
    return { data, status: data.duplicate ? 200 : 201 };
  }
  if (/^POST \/owner\/casino\/batches\/[^/]+\/cancel$/.test(route)) {
    v.keys(body, []);
    return {
      data: await call('owner-casino-cancel', {
        id: v.uuid(path.split('/')[4]),
      }),
    };
  }
  if (/^POST \/owner\/casino\/gifts\/[^/]+\/fulfil$/.test(route)) {
    v.keys(body, []);
    return {
      data: await call('owner-casino-gift-fulfil', {
        id: v.uuid(path.split('/')[4]),
      }),
    };
  }
  if (route === 'GET /owner/vouchers')
    return { data: await call('owner-voucher-list') };
  if (/^POST \/owner\/vouchers\/[^/]+\/(fulfil|cancel)$/.test(route)) {
    v.keys(body, []);
    const id = v.uuid(path.split('/')[3]);
    return {
      data: await call(
        path.endsWith('/fulfil')
          ? 'owner-voucher-fulfil'
          : 'owner-voucher-cancel',
        { id },
      ),
    };
  }
  return undefined;
}
