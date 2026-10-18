import type { RoomView } from '../../club/domain/clubState';
import type { RoomId } from '../../club/domain/rooms';
import { formatClubTime } from '../../club/domain/schedule';

type Entry =
  | { state: 'here'; status: string }
  | { state: 'open'; status: string; action: string }
  | { state: 'preparing'; status: string }
  | { state: 'locked'; status: string };

function entryFor(view: RoomView): Entry {
  const { room } = view;
  if (room.id === 'lounge') return { state: 'here', status: 'You are here' };
  if (room.id === 'entrance')
    return { state: 'open', status: 'Always open', action: 'Revisit' };
  if (!view.open) {
    return {
      state: 'locked',
      status:
        view.opensAt !== null
          ? `Opens at ${formatClubTime(view.opensAt)}`
          : 'Opens with your membership',
    };
  }
  if (!view.enterable) return { state: 'preparing', status: 'Being prepared' };
  return {
    state: 'open',
    status: view.completed ? 'Visited' : 'Open',
    action: view.completed ? 'Return' : 'Enter',
  };
}

/**
 * The engraved brass directory by the hearth. Every room is listed; only
 * rooms that can really be entered offer a way in.
 */
export function Directory({
  views,
  recommended,
  onEnter,
}: {
  views: readonly RoomView[];
  recommended: RoomId | null;
  onEnter(room: RoomId): void;
}) {
  return (
    <ol className="directory">
      {views.map((view) => {
        const entry = entryFor(view);
        const next = view.room.id === recommended;
        return (
          <li
            key={view.room.id}
            className="directory__room"
            data-state={entry.state}
            aria-current={entry.state === 'here' ? 'location' : undefined}
          >
            <span className="directory__name">
              {view.room.name}
              {next && <span className="directory__next">Next</span>}
            </span>
            <span className="directory__status">{entry.status}</span>
            {entry.state === 'open' && (
              <button
                type="button"
                className="directory__enter"
                aria-label={`${entry.action}: ${view.room.name}`}
                onClick={() => onEnter(view.room.id)}
              >
                {entry.action}
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
