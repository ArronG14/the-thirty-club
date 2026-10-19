import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  isAdmissionRoom,
  type AdmissionRoomId,
} from '../../../shared/journey/contract';
import { ADMISSION_ESCORT_LINE } from '../../../shared/journey/templates';
import { useJourney } from '../../journey/journeyContext';
import { AdmissionLetter } from '../../journey/ui/AdmissionLetter';
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
  SCREENING_ESCORT_LINE,
  type Arrival,
  type Briefing,
} from '../../club/domain/loungeScript';
import { findRoom, ROOMS, type RoomId } from '../../club/domain/rooms';
import { formatClubTime } from '../../club/domain/schedule';
import { preloadRoom } from '../../club/ui/roomViews';
import { useClub } from '../../club/useClub';
import { speechDuration } from '../../entrance/domain/butlerScript';
import type { EntranceEnvironment } from '../../entrance/domain/environment';
import { canRender3D } from '../../entrance/scene/canRender3D';
import type { EntranceModel } from '../../entrance/useEntrance';
import type { LoungeFocus } from '../scene/loungeMath';
import { Directory } from './Directory';
import { MembershipCard } from './MembershipCard';
import { Sheet } from './Sheet';
import { useButlerService } from '../../butler-service/useButlerService';
import { ArrivedEnvelope } from '../../butler-service/ui/ArrivedEnvelope';
import './lounge.css';

const LoungeCanvas = lazy(() => import('../scene/LoungeCanvas'));

type RenderMode = 'poster' | 'loading' | 'fading' | 'scene';
type Overlay = 'card' | 'directory' | null;
const FADE_MS = 1400;
/**
 * The Butler's escort to the Screening Room: the camera walks towards the
 * doorway, the picture fades to black (lounge.css), then the room loads
 * and fades in with her already seated. About 3.5 s door to seat.
 */
const ESCORT_MS = 2300;
const ESCORT_REDUCED_MS = 400;

const SCREENING = findRoom('screening-room')!;
const directoryNames = (views: readonly RoomView[]) =>
  ROOMS.filter((room) =>
    views.some((view) => view.room.id === room.id && !view.hidden),
  ).map((room) => room.name.replace(/^The /, '').replace('Private ', ''));
/** The doorway's engraving before the Screening Room is introduced. */
const UNNAMED_DOORWAY = 'Private';
/** The Butler presents a waiting letter a moment after she sits down. */
const LETTER_DELAY_MS = 1200;

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
  model: Pick<
    EntranceModel,
    'welcomed' | 'replay' | 'reducedMotion' | 'currentHour'
  >;
  environment: EntranceEnvironment;
}) {
  const { welcomed, replay, reducedMotion, currentHour } = model;
  const journey = useJourney();
  const club = useClub(environment, journey?.snapshot.rooms);
  const navigate = useNavigate();
  const location = useLocation();
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
  const [escort, setEscort] = useState<string | null>(null);
  // Letters of Admission (ADR-020): the one asked for by a link first.
  const [requested] = useState(() => {
    const room = new URLSearchParams(location.search).get('admission');
    return isAdmissionRoom(room) ? room : null;
  });
  const [laterRooms, setLaterRooms] = useState<readonly AdmissionRoomId[]>([]);
  const [letterReady, setLetterReady] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [letterError, setLetterError] = useState<string | null>(null);
  const [names] = useState(() => directoryNames(club.views));
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
    if (!escort) return;
    const timer = setTimeout(
      () => navigate(escort),
      reducedMotion ? ESCORT_REDUCED_MS : ESCORT_MS,
    );
    return () => clearTimeout(timer);
  }, [escort, navigate, reducedMotion]);

  useEffect(() => {
    const timer = setTimeout(
      () => setLetterReady(true),
      reducedMotion ? 0 : LETTER_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [reducedMotion]);

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
        views: roomViews(now, record, ROOMS, journey?.snapshot.rooms),
        record,
        hour: currentHour(),
        arrival: 'induction',
      }),
    );
    requestAnimationFrame(() => voice.current?.focus());
  }

  // The Butler's service: the same bell, menu and correspondence as at the
  // doors. He speaks through his own voice here, and never during the
  // induction or over a sheet.
  const pending = journey?.snapshot.pending ?? [];
  const waiting = pending.filter((p) => !laterRooms.includes(p.roomId));
  const letter =
    club.inducted && letterReady && overlay === null && escort === null
      ? (waiting.find((p) => p.roomId === requested) ?? waiting[0] ?? null)
      : null;
  const later = useCallback((room: AdmissionRoomId) => {
    setLetterError(null);
    setLaterRooms((rooms) => [...rooms, room]);
  }, []);

  async function acceptLetter(room: AdmissionRoomId) {
    if (!journey || accepting) return;
    setAccepting(true);
    setLetterError(null);
    const outcome = await journey.accept(room);
    setAccepting(false);
    if (!outcome.ok) {
      setLetterError(outcome.message);
      return;
    }
    // He has introduced it in person; no announcement later.
    club.introduce([room]);
    if (room === 'lounge') {
      say(['Welcome, Madam. Do make yourself at home.'], 'concierge');
      return;
    }
    const target = findRoom(room);
    if (!target?.built) {
      say([preparingLine(target?.name ?? 'the room')], 'concierge');
      return;
    }
    club.visit(room);
    say(
      [room === SCREENING.id ? SCREENING_ESCORT_LINE : ADMISSION_ESCORT_LINE],
      'concierge',
    );
    preloadRoom(room);
    setEscort(target.path);
  }

  const service = useButlerService({
    place: 'lounge',
    say: useCallback((text: string) => say([text], 'concierge'), [say]),
    // Never over a Letter of Admission (or the moment before it is
    // presented) or during an escort.
    enabled:
      club.inducted &&
      overlay === null &&
      letter === null &&
      escort === null &&
      (letterReady || pending.length === 0),
    delayMs: welcomed ? 9000 : 3000,
  });

  function ring() {
    say([conciergeLine(rings)], 'concierge');
    setRings((n) => n + 1);
    service.ring();
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
      if (escort) return;
      club.visit(id);
      if (id === SCREENING.id) {
        // He shows her to her seat rather than cutting to the room.
        setOverlay(null);
        say([SCREENING_ESCORT_LINE], 'concierge');
        preloadRoom(id);
        setEscort(view.room.path);
        return;
      }
      navigate(view.room.path);
      return;
    }
    if (view.open) say([preparingLine(view.room.name)], 'concierge');
  }

  const destination = briefing?.destination ?? null;
  const upcoming = nextOpening(club.views);
  const screeningView = club.views.find((v) => v.room.id === SCREENING.id);
  const screeningLabel = screeningView?.hidden
    ? UNNAMED_DOORWAY
    : 'Screening Room';
  const inducted = club.inducted;
  const step = INDUCTION[Math.min(beat, INDUCTION.length - 1)]!;

  let focus: LoungeFocus = 'room';
  if (escort) focus = 'escort';
  else if (overlay === 'directory') focus = 'directory';
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
      data-escort={escort ? 'true' : 'false'}
      aria-labelledby="lounge-title"
      aria-busy={escort !== null}
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
            directoryNames={names}
            screeningName={screeningLabel}
            onReady={() => setMode((m) => (m === 'loading' ? 'fading' : m))}
            onFallback={() => setMode('poster')}
            onSelect={(target) => {
              if (!inducted || overlay || escort) return;
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
            {screeningLabel}
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
      {escort && <div className="lounge__escort" aria-hidden="true" />}

      <div
        className="lounge__frame"
        inert={overlay !== null || escort !== null || letter !== null}
      >
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
              {pending.length > 0 && letter === null && !escort ? (
                <section className="guide" aria-labelledby="guide-room">
                  <p className="guide__eyebrow">The Butler has a letter</p>
                  <p id="guide-room" className="guide__room">
                    A Letter of Admission awaits you
                  </p>
                  <button
                    type="button"
                    className="cta"
                    onClick={() => {
                      setOverlay(null);
                      setLaterRooms([]);
                    }}
                  >
                    Read your letter
                  </button>
                </section>
              ) : (
                <Guide
                  destination={destination}
                  upcoming={upcoming}
                  more={club.views.some((v) => v.hidden)}
                  onContinue={(id) => enter(id)}
                  onAttention={setEyeOnDoor}
                />
              )}
              {service.view.kind === 'none' && (
                <ArrivedEnvelope
                  unread={service.unread}
                  onOpen={service.openLetter}
                  compact
                />
              )}
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
            views={club.views.filter((v) => !v.hidden)}
            recommended={destination?.room.id ?? null}
            onEnter={enter}
          />
        </Sheet>
      )}
      {letter && (
        <AdmissionLetter
          key={letter.roomId}
          admission={letter}
          busy={accepting}
          error={letterError}
          onAccept={() => void acceptLetter(letter.roomId)}
          onLater={() => later(letter.roomId)}
        />
      )}
      {inducted && service.overlays}
    </section>
  );
}

/** Where the evening goes next: one clear action, or an honest status. */
function Guide({
  destination,
  upcoming,
  more,
  onContinue,
  onAttention,
}: {
  destination: RoomView | null;
  upcoming: RoomView | null;
  /** Rooms still to be introduced by the Butler (ADR-020). */
  more: boolean;
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
        {more
          ? 'More of the club will be revealed in due course'
          : 'Every room is open to you'}
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
