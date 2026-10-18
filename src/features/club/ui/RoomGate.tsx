import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ComponentType,
} from 'react';
import { useParams } from 'react-router';
import { createEntranceEnvironment } from '../../entrance/entranceEnvironment';
import { isRoomId, type RoomId } from '../domain/rooms';
import { formatClubTime } from '../domain/schedule';
import { useClub } from '../useClub';
import './roomGate.css';

/** A built room must also register its lazy view here. */
const ROOM_VIEWS: Partial<
  Record<RoomId, ComponentType<{ onComplete(): void }>>
> = {
  'screening-room': lazy(() => import('../../screening/ui/ScreeningRoom')),
};

/**
 * `/rooms/:roomId`. The club's door staff: a room is shown only when it is
 * open and built. Otherwise an honest notice and the way back.
 */
export function RoomGate() {
  const { roomId } = useParams();
  const [environment] = useState(() => createEntranceEnvironment());
  const club = useClub(environment);
  const view = club.views.find(
    (v) => v.room.id === roomId && v.room.sequence !== null,
  );

  const { visit, complete } = club;
  const enterableId = view?.enterable ? view.room.id : null;
  useEffect(() => {
    if (enterableId) visit(enterableId);
  }, [enterableId, visit]);
  const onComplete = useCallback(() => {
    if (isRoomId(roomId)) complete(roomId);
  }, [roomId, complete]);

  if (!view) {
    return (
      <section className="plain-page">
        <h1>This room does not exist.</h1>
        <a href="/">Return to the entrance</a>
      </section>
    );
  }

  const Room = ROOM_VIEWS[view.room.id];
  if (view.enterable && Room)
    return (
      <Suspense
        fallback={
          <section className="plain-page">
            <p>Preparing your private screening…</p>
            <a href="/">Return to the lounge</a>
          </section>
        }
      >
        <Room onComplete={onComplete} />
      </Suspense>
    );

  let notice: string;
  if (!view.open) {
    notice =
      view.opensAt !== null
        ? `It opens at ${formatClubTime(view.opensAt)}, Jamaica time.`
        : 'It opens once your membership has been presented.';
  } else {
    notice =
      'It is still being prepared. The butler will announce it in the lounge.';
  }
  return (
    <section className="plain-page room-gate" aria-labelledby="room-title">
      <p className="room-gate__eyebrow">The Thirty Club</p>
      <h1 id="room-title">{view.room.name}</h1>
      <p className="room-gate__notice">
        {view.open
          ? 'This room is not ready yet.'
          : 'This room is not open yet.'}{' '}
        {notice}
      </p>
      <a href="/">Return to the club</a>
    </section>
  );
}
