import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router';
import {
  inductMember,
  nextOpening,
  roomViews,
  unannounced,
  type RoomView,
} from '../../club/domain/clubState';
import {
  conciergeLine,
  INDUCTION,
  loungeBriefing,
  preparingLine,
  type Arrival,
  type Briefing,
} from '../../club/domain/loungeScript';
import { findRoom, ROOMS, type RoomId } from '../../club/domain/rooms';
import { formatClubTime } from '../../club/domain/schedule';
import { useClub } from '../../club/useClub';
import { speechDuration } from '../../entrance/domain/butlerScript';
import type { EntranceEnvironment } from '../../entrance/domain/environment';
import { canRender3D } from '../../entrance/scene/canRender3D';
import type { EntranceModel } from '../../entrance/useEntrance';
import type { LoungeFocus } from '../scene/loungeMath';
import { Directory } from './Directory';
import { MembershipCard } from './MembershipCard';
import { Sheet } from './Sheet';
import { CorrespondenceNoticeSlot } from '../../correspondence/ui/noticeSlot';
import './lounge.css';

const LoungeCanvas = lazy(() => import('../scene/LoungeCanvas'));

type RenderMode = 'poster' | 'loading' | 'fading' | 'scene';
type Overlay = 'card' | 'directory' | null;
const FADE_MS = 1400;

const SCREENING = findRoom('screening-room')!;
const DIRECTORY_NAMES = ROOMS.map((room) =>
  room.name.replace(/^The /, '').replace('Private ', ''),
);

interface Speech {
  lines: readonly string[];
  kind: 'briefing' | 'concierge';
  turn: number;
  visible: boolean;
}

const sameRooms = (a: readonly RoomView[], b: readonly RoomId[]) =>
  a.length === b.length && a.every((view, i) => view.room.id === b[i]);

/**
 * The Members' Lounge: the club's hub. On a first visit the butler presents
 * the membership; afterwards he greets, brings news and suggests where to
 * go next, while the directory offers every room that is open.
 */
export function Lounge({
  model,
  environment,
}: {
  model: EntranceModel;
  environment: EntranceEnvironment;
}) {
  const { welcomed, replay, reducedMotion, currentHour } = model;
  const club = useClub(environment);
  const navigate = useNavigate();
  const [mode, setMode] = useState<RenderMode>(() =>
    canRender3D() ? 'loading' : 'poster',
  );
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [beat, setBeat] = useState(0);
  const [arrival] = useState<Arrival>(() =>
    club.inducted ? (welcomed ? 'entrance' : 'return') : 'induction',
  );
  const [briefing, setBriefing] = useState<Briefing | null>(() =>
    club.inducted
      ? loungeBriefing({
          views: club.views,
          record: club.record,
          hour: currentHour(),
          arrival,
        })
      : null,
  );
  const [speech, setSpeech] = useState<Speech | null>(() =>
    briefing
      ? { lines: briefing.lines, kind: 'briefing', turn: 1, visible: true }
      : null,
  );
  const [spoken, setSpoken] = useState(briefing);
  const [rings, setRings] = useState(0);
  const [eyeOnDoor, setEyeOnDoor] = useState(false);
  const voice = useRef<HTMLDivElement>(null);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const openSheet = (sheet: Overlay, from: HTMLElement | null) => {
    setOpener(from);
    setOverlay(sheet);
  };
  const closeSheet = useCallback(() => setOverlay(null), []);
  const turn = speech?.turn ?? 0;

  // News while she sits here: a room opened on schedule.
  const fresh =
    club.inducted && briefing ? unannounced(club.views, club.record) : [];
  if (briefing && fresh.length > 0 && !sameRooms(fresh, briefing.introduces)) {
    setBriefing(
      loungeBriefing({
        views: club.views,
        record: club.record,
        hour: currentHour(),
        arrival: 'present',
      }),
    );
  }
  // Each new briefing is spoken once.
  if (briefing !== spoken) {
    setSpoken(briefing);
    if (briefing)
      setSpeech({
        lines: briefing.lines,
        kind: 'briefing',
        turn: turn + 1,
        visible: true,
      });
  }

  // Remember what he has introduced, so he never repeats himself.
  const { introduce } = club;
  useEffect(() => {
    if (briefing) introduce(briefing.introduces);
  }, [briefing, introduce]);

  // He withdraws after a comfortable reading time.
  useEffect(() => {
    if (!speech?.visible) return;
    const timer = setTimeout(
      () => setSpeech((s) => (s ? { ...s, visible: false } : s)),
      speechDuration(speech.lines.join(' ')),
    );
    return () => clearTimeout(timer);
  }, [speech]);

  // Arriving through the doors, or beginning the ceremony, lands focus on
  // what the butler is saying rather than on a vanished door.
  useEffect(() => {
    if (welcomed || !club.inducted) voice.current?.focus();
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== 'fading') return;
    const timer = setTimeout(() => setMode('scene'), FADE_MS);
    return () => clearTimeout(timer);
  }, [mode]);

  const say = useCallback((lines: readonly string[], kind: Speech['kind']) => {
    setSpeech((s) => ({
      lines,
      kind,
      turn: (s?.turn ?? 0) + 1,
      visible: true,
    }));
  }, []);

  function accept() {
    const now = environment.clock.now();
    const record = inductMember(club.record, now);
    club.induct();
    setBriefing(
      loungeBriefing({
        views: roomViews(now, record),
        record,
        hour: currentHour(),
        arrival: 'induction',
      }),
    );
    requestAnimationFrame(() => voice.current?.focus());
  }

  function ring() {
    say([conciergeLine(rings)], 'concierge');
    setRings((n) => n + 1);
  }

  function enter(id: RoomId) {
    if (id === 'entrance') {
      setOverlay(null);
      replay();
      return;
    }
    const view = club.views.find((v) => v.room.id === id);
    if (!view) return;
    if (view.enterable) {
      club.visit(id);
      navigate(view.room.path);
      return;
    }
    if (view.open) say([preparingLine(view.room.name)], 'concierge');
  }

  const destination = briefing?.destination ?? null;
  const upcoming = nextOpening(club.views);
  const screeningView = club.views.find((v) => v.room.id === SCREENING.id);
  const inducted = club.inducted;
  const step = INDUCTION[Math.min(beat, INDUCTION.length - 1)]!;

  let focus: LoungeFocus = 'room';
  if (overlay === 'directory') focus = 'directory';
  else if (overlay === 'card') focus = 'hearth';
  else if (!inducted) focus = step.id === 'welcome' ? 'room' : 'hearth';
  else if (
    destination?.room.id === SCREENING.id &&
    (eyeOnDoor || (speech?.visible && speech.kind === 'briefing'))
  )
    focus = 'screening';

  const live = mode === 'fading' || mode === 'scene';

  return (
    <section
      className="lounge"
      data-render={mode}
      data-phase={inducted ? 'hub' : 'induction'}
      data-arrival={welcomed ? 'ceremony' : 'return'}
      data-overlay={overlay ?? 'none'}
      aria-labelledby="lounge-title"
    >
      <div className="lounge-poster" aria-hidden="true">
        <div className="lounge-poster__chandelier" />
        <div className="lounge-poster__overmantel" />
        <div className="lounge-poster__mantel">
          <span className="lounge-poster__fire" />
        </div>
        <div className="lounge-poster__floor" />
      </div>
      {mode !== 'poster' && (
        <Suspense fallback={null}>
          <LoungeCanvas
            focus={focus}
            arriving={welcomed}
            screeningOpen={Boolean(screeningView?.open)}
            reducedMotion={reducedMotion}
            directoryNames={DIRECTORY_NAMES}
            screeningName="Screening Room"
            onReady={() => setMode((m) => (m === 'loading' ? 'fading' : m))}
            onFallback={() => setMode('poster')}
            onSelect={(target) => {
              if (!inducted || overlay) return;
              if (target === 'directory') openSheet('directory', null);
              else enter(SCREENING.id);
            }}
          />
        </Suspense>
      )}
      {live && (
        <>
          <span
            className="lounge__mark lounge__mark--screening"
            aria-hidden="true"
          >
            Screening Room
          </span>
          <span
            className="lounge__mark lounge__mark--directory"
            aria-hidden="true"
          >
            Directory
          </span>
        </>
      )}
      <div className="lounge__flare" aria-hidden="true" />

      <div className="lounge__frame" inert={overlay !== null}>
        <header className="lounge__place">
          <p className="lounge__eyebrow">The Thirty Club</p>
          <h1 id="lounge-title" className="lounge__title">
            The Members’ Lounge
          </h1>
        </header>

        <div className="lounge__deck">
          <div
            ref={voice}
            className="butler"
            data-speaking={
              (inducted ? speech?.visible : true) ? 'true' : 'false'
            }
            tabIndex={-1}
            aria-live="polite"
          >
            {inducted ? (
              speech && (
                <figure key={speech.turn} className="butler__words">
                  <blockquote>
                    {speech.lines.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </blockquote>
                  <figcaption>The Butler</figcaption>
                </figure>
              )
            ) : (
              <figure key={step.id} className="butler__words">
                <blockquote>
                  {step.lines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </blockquote>
                <figcaption>The Butler</figcaption>
              </figure>
            )}
          </div>

          {!inducted ? (
            <div className="induction" data-beat={step.id}>
              {step.id === 'card' && (
                <div className="induction__card">
                  <MembershipCard presenting />
                </div>
              )}
              <div className="induction__actions">
                {step.id === 'card' ? (
                  <button type="button" className="cta" onClick={accept}>
                    Accept your membership
                  </button>
                ) : (
                  <button
                    type="button"
                    className="cta cta--quiet"
                    onClick={() => setBeat((b) => b + 1)}
                  >
                    Continue
                  </button>
                )}
                {step.id !== 'card' && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setBeat(INDUCTION.length - 1)}
                  >
                    Skip to your card
                  </button>
                )}
              </div>
              <ol className="induction__progress" aria-hidden="true">
                {INDUCTION.map((b, i) => (
                  <li key={b.id} data-done={i <= beat ? 'true' : 'false'} />
                ))}
              </ol>
            </div>
          ) : (
            <>
              <Guide
                destination={destination}
                upcoming={upcoming}
                onContinue={(id) => enter(id)}
                onAttention={setEyeOnDoor}
              />
              <nav className="dock" aria-label="The club">
                <button
                  type="button"
                  className="dock__item"
                  onClick={(e) => openSheet('directory', e.currentTarget)}
                >
                  <Glyph kind="directory" />
                  Members’ Directory
                </button>
                <button
                  type="button"
                  className="dock__item"
                  onClick={(e) => openSheet('card', e.currentTarget)}
                >
                  <Glyph kind="card" />
                  Membership card
                </button>
                <button type="button" className="dock__item" onClick={ring}>
                  <Glyph kind="bell" />
                  Ring for service
                </button>
              </nav>
            </>
          )}
        </div>
      </div>

      {overlay === 'card' && (
        <Sheet
          variant="card"
          label="The Thirty Club"
          title="Your membership"
          returnFocusTo={opener}
          onClose={closeSheet}
        >
          <MembershipCard />
        </Sheet>
      )}
      {overlay === 'directory' && (
        <Sheet
          variant="directory"
          label="The Thirty Club"
          title="Members’ Directory"
          returnFocusTo={opener}
          onClose={closeSheet}
        >
          <Directory
            views={club.views}
            recommended={destination?.room.id ?? null}
            onEnter={enter}
          />
        </Sheet>
      )}
      {/* Never during the induction or over an open sheet. */}
      {inducted && !overlay && (
        <CorrespondenceNoticeSlot delayMs={welcomed ? 9000 : 3000} />
      )}
    </section>
  );
}

/** Where the evening goes next: one clear action, or an honest status. */
function Guide({
  destination,
  upcoming,
  onContinue,
  onAttention,
}: {
  destination: RoomView | null;
  upcoming: RoomView | null;
  onContinue(room: RoomId): void;
  onAttention(on: boolean): void;
}) {
  if (destination) {
    return (
      <section className="guide" aria-labelledby="guide-room">
        <p className="guide__eyebrow">Your evening continues</p>
        <p id="guide-room" className="guide__room">
          {destination.room.name}
        </p>
        {destination.enterable ? (
          <button
            type="button"
            className="cta"
            onClick={() => onContinue(destination.room.id)}
            onPointerEnter={() => onAttention(true)}
            onPointerLeave={() => onAttention(false)}
            onFocus={() => onAttention(true)}
            onBlur={() => onAttention(false)}
          >
            Continue your evening
          </button>
        ) : (
          <p className="guide__status">Being prepared</p>
        )}
      </section>
    );
  }
  if (upcoming?.opensAt != null) {
    return (
      <section className="guide" aria-labelledby="guide-room">
        <p className="guide__eyebrow">Later today</p>
        <p id="guide-room" className="guide__room">
          {upcoming.room.name}
        </p>
        <p className="guide__status">
          Opens at {formatClubTime(upcoming.opensAt)}
        </p>
      </section>
    );
  }
  return (
    <section className="guide" aria-labelledby="guide-room">
      <p className="guide__eyebrow">At your leisure</p>
      <p id="guide-room" className="guide__room">
        Every room is open to you
      </p>
    </section>
  );
}

/** Engraved line icons for the dock. */
function Glyph({ kind }: { kind: 'directory' | 'card' | 'bell' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
    >
      {kind === 'directory' && (
        <>
          <rect x="5" y="3" width="14" height="18" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </>
      )}
      {kind === 'card' && (
        <>
          <rect x="2.5" y="6" width="19" height="12.5" rx="1.6" />
          <circle cx="17" cy="10.5" r="1.8" />
          <path d="M5.5 15h7" />
        </>
      )}
      {kind === 'bell' && (
        <>
          <path d="M4 17.5h16M5.5 17.5a6.5 6.5 0 0 1 13 0" />
          <path d="M12 9v-2M10.5 7h3M3 20h18" />
        </>
      )}
    </svg>
  );
}
