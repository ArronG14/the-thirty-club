import { lazy, type ComponentType } from 'react';
import type { RoomId } from '../domain/rooms';

type RoomView = ComponentType<{ onComplete(): void }>;
/** A built room must also register its lazy view here. */
const ROOM_LOADERS: Partial<
  Record<RoomId, () => Promise<{ default: RoomView }>>
> = {
  'screening-room': () => import('../../screening/ui/ScreeningRoom'),
  casino: () => import('../../casino/ui/Casino'),
  'gift-vault': () => import('../../vault/ui/VaultRoutes'),
};
export const ROOM_VIEWS: Partial<Record<RoomId, RoomView>> = Object.fromEntries(
  Object.entries(ROOM_LOADERS).map(([id, load]) => [id, lazy(load)]),
);

/** Starts fetching a room's code early (e.g. during the Butler's escort). */
export function preloadRoom(id: RoomId) {
  void ROOM_LOADERS[id]?.().catch(() => undefined);
}
