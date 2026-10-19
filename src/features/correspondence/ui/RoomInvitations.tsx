/**
 * When a letter mentions one of the club's rooms, the foot of the letter
 * offers the way in — but only if the room is really open for Alise now.
 * Otherwise it says honestly when it opens. A letter can therefore never
 * send her to a locked Casino. In a rehearsal (ADR-018) a locked room can
 * also be launched in its unlocked rehearsal state; that never touches the
 * real room, her clock or her records. A room that needs an admission is
 * never mentioned until she has accepted it (ADR-020).
 */
import { useState } from 'react';
import { roomViews, type RoomView } from '../../club/domain/clubState';
import { formatClubTime } from '../../club/domain/schedule';
import { createEntranceEnvironment } from '../../entrance/entranceEnvironment';
import { ROOMS } from '../../club/domain/rooms';
import { useJourney } from '../../journey/journeyContext';
import { simulationActive } from '../../rehearsal/mode';
import { MENTIONS, mentionedRooms } from '../domain/roomMentions';

function opening(view: RoomView): string {
  if (!view.room.built) return 'It is still being prepared.';
  if (view.opensAt !== null) {
    const day = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Jamaica',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date(view.opensAt));
    return `It opens at ${formatClubTime(view.opensAt)}, Jamaica time, on ${day}.`;
  }
  return 'It opens with your membership, on your birthday.';
}

export function RoomInvitations({ text }: { text: string }) {
  const access = useJourney()?.snapshot.rooms;
  const [env] = useState(() => createEntranceEnvironment());
  const views = roomViews(
    env.clock.now(),
    env.membership.load(),
    ROOMS,
    access,
  );
  const rooms = mentionedRooms(text)
    .map((id) => views.find((v) => v.room.id === id))
    .filter((v): v is RoomView => Boolean(v) && !v!.hidden);
  if (rooms.length === 0) return null;
  return (
    <aside className="cd-rooms" aria-label="Rooms mentioned in this letter">
      {rooms.map((view) => {
        const verb = MENTIONS.find((m) => m.id === view.room.id)!.verb;
        return (
          <div key={view.room.id} className="cd-rooms__room">
            {view.enterable ? (
              <a className="cd-button" href={view.room.path}>
                {verb} {view.room.name.replace(/^The /, 'the ')}
              </a>
            ) : (
              <>
                <p>
                  <strong>{view.room.name}</strong> is not open yet.{' '}
                  {opening(view)}
                </p>
                {simulationActive && view.room.built && (
                  <button
                    type="button"
                    className="cd-button cd-button--quiet"
                    onClick={() =>
                      void import('../../rehearsal/engine').then((engine) =>
                        engine.launchRoom(view.room.id),
                      )
                    }
                  >
                    Rehearsal: launch {view.room.name} unlocked
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </aside>
  );
}
