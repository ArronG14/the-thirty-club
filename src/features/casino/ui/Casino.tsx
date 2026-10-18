import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router';
import { createEntranceEnvironment } from '../../entrance/entranceEnvironment';
import { canRender3D } from '../../entrance/scene/canRender3D';
import { useReducedMotion } from '../../../shared/ui/useReducedMotion';
import { CLUB_REWARDS } from '../../prizes/clubRewards';
import { createCasinoAudio } from '../audio/casinoAudio';
import { RESULT_BEAT_MS } from '../config/casinoRules';
import { spinsRemaining } from '../domain/casinoState';
import {
  pocketIndex,
  totalStake,
  type PlacedBet,
  type Settlement,
} from '../domain/roulette';
import type { SlotEvaluation } from '../domain/slots';
import type { CasinoStage } from '../scene/CasinoCanvas';
import { planReel, planSpin, type Station } from '../scene/casinoMath';
import { createCasinoStores, useCasino } from '../useCasino';
import { CollectionSheet } from './CollectionSheet';
import { CasinoEntranceFilm } from './EntranceFilm';
import { shouldPlayEntranceFilm } from './entranceFilmRule';
import { FallbackStage, type FallbackSpin } from './FallbackStage';
import { RewardReveal } from './RewardReveal';
import { RoulettePanel, type RoulettePhase } from './RoulettePanel';
import { SlotsPanel, type SlotsPhase } from './SlotsPanel';
import { useButler } from './useButler';
import { nextLine } from '../domain/butler';
import './casino.css';

const CasinoCanvas = lazy(() => import('../scene/CasinoCanvas'));
const DevTools = import.meta.env.DEV
  ? lazy(() => import('../dev/DevTools'))
  : null;

type RenderMode = 'poster' | 'loading' | 'fading' | 'scene';
const FADE_MS = 1200;

/** DEVELOPMENT ONLY: the roulette and slots previews open at their game. */
function devStation(preview: string | null): Station {
  if (!import.meta.env.DEV) return 'lobby';
  if (preview === 'casino-roulette') return 'roulette';
  if (preview === 'casino-slots' || preview === 'casino-jackpot')
    return 'slots';
  return 'lobby';
}

const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The Grand Casino. A lobby you can walk up to, a roulette table and a
 * slot machine, all in one room; the prize ledger decides what is won.
 * This component only orchestrates: games decide in the domain, the scene
 * animates, the panels collect input.
 */
export default function Casino({ onComplete }: { onComplete(): void }) {
  const [environment] = useState(() => createEntranceEnvironment());
  const [stores] = useState(() => createCasinoStores(environment));
  const model = useCasino(stores);
  const reducedMotion = useReducedMotion();
  const butler = useButler(model.clock.now);
  const [audio] = useState(() => createCasinoAudio(model.state.casino.soundOn));
  const stage = useRef<CasinoStage>(null);

  const [render, setRender] = useState<RenderMode>(() =>
    canRender3D() ? 'loading' : 'poster',
  );
  const [initial] = useState(() => devStation(environment.preview));
  const [view, setView] = useState<Station>(initial);
  const [arrived, setArrived] = useState<Station | null>(initial);
  const [film, setFilm] = useState(() => shouldPlayEntranceFilm(reducedMotion));

  // The game state the panels share.
  const [slip, setSlip] = useState<PlacedBet[]>([]);
  const [roulettePhase, setRoulettePhase] = useState<RoulettePhase>('betting');
  const [rouletteResult, setRouletteResult] = useState<Settlement | null>(null);
  const [slotsPhase, setSlotsPhase] = useState<SlotsPhase>('ready');
  const [slotsResult, setSlotsResult] = useState<{
    evaluation: SlotEvaluation;
    net: number;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fallbackSpin, setFallbackSpin] = useState<FallbackSpin>(null);
  const [busy, setBusy] = useState(false);

  const [revealId, setRevealId] = useState<string | null>(null);
  const [later, setLater] = useState<ReadonlySet<string>>(new Set());
  const [collection, setCollection] = useState<{
    opener: HTMLElement | null;
  } | null>(null);
  const [revealLine, setRevealLine] = useState('');

  const working = useRef(false);
  const mounted = useRef(true);
  const entered = useRef(false);
  const firstVisit = useRef(model.state.casino.visits === 0);
  const panelRef = useRef<HTMLDivElement>(null);
  const spinCount = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      audio.dispose();
    };
  }, [audio]);

  // Entering the casino is recorded once.
  const { enter } = model;
  useEffect(() => {
    if (entered.current) return;
    entered.current = true;
    enter();
  }, [enter]);

  // The scene fades in; the butler welcomes her as it does.
  const { say } = butler;
  const welcomed = useRef(false);
  const live = render === 'fading' || render === 'scene';
  useEffect(() => {
    if (render !== 'fading' && render !== 'poster') return;
    if (welcomed.current) return;
    welcomed.current = true;
    say(firstVisit.current ? 'enter-first' : 'enter-return', true);
  }, [render, say]);
  useEffect(() => {
    if (render !== 'fading') return;
    const timer = setTimeout(() => setRender('scene'), FADE_MS);
    return () => clearTimeout(timer);
  }, [render]);

  const panelStation: Station | null = live ? arrived : view;
  const panelOpen = view !== 'lobby' && panelStation === view;

  // Greeting at each game, and focus onto the panel as it appears.
  useEffect(() => {
    if (!panelOpen) return;
    say(view === 'roulette' ? 'roulette-open' : 'slots-open');
    panelRef.current?.focus({ preventScroll: true });
  }, [panelOpen, view, say]);

  const goTo = useCallback(
    (station: Station) => {
      if (working.current) return;
      audio.unlock();
      setMessage(null);
      setArrived(live ? null : station);
      setView(station);
    },
    [audio, live],
  );

  /* ---------------- Prizes ---------------- */

  const pending = model.pending;
  const nextPending = pending.find((r) => !later.has(r.id)) ?? null;
  useEffect(() => {
    if (revealId || busy || !nextPending || collection) return;
    if (live && arrived === null) return;
    const timer = setTimeout(
      () => {
        if (!mounted.current) return;
        setRevealLine(nextLine(`reward-${nextPending.kind}`, 0));
        setRevealId(nextPending.id);
        audio.reveal();
      },
      reducedMotion ? 250 : 1100,
    );
    return () => clearTimeout(timer);
  }, [
    revealId,
    busy,
    nextPending,
    collection,
    live,
    arrived,
    reducedMotion,
    audio,
  ]);

  const revealing = revealId
    ? (CLUB_REWARDS.find((r) => r.id === revealId) ?? null)
    : null;
  const { claim } = model;
  const claimReward = useCallback(
    (id: string) => {
      claim(id);
      setLater((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    },
    [claim],
  );

  const complete = model.complete;
  useEffect(() => {
    if (complete) {
      onComplete();
      say('complete', true);
    }
  }, [complete, onComplete, say]);

  /* ---------------- Spins ---------------- */

  const fallbackRun = useCallback(
    (spin: Exclude<FallbackSpin, null>, ms: number) => {
      spinCount.current += 1;
      setFallbackSpin({ ...spin, key: spinCount.current } as FallbackSpin);
      return pause(reducedMotion ? Math.min(ms, 1600) : ms);
    },
    [reducedMotion],
  );

  const spinRoulette = useCallback(async () => {
    if (working.current) return;
    audio.unlock();
    const play = model.spinRoulette(slip);
    if (!play.ok) {
      setMessage(play.message);
      if (play.reason === 'closed') say('closing', true);
      return;
    }
    working.current = true;
    setBusy(true);
    setMessage(null);
    setRouletteResult(null);
    setRoulettePhase('spinning');
    const pocket = pocketIndex(play.outcome.number);
    const plan = planSpin({ pocket, wheelStart: 0, reducedMotion });
    audio.roulette(plan.ballSeconds);
    await (live && stage.current
      ? stage.current.spinRoulette(pocket)
      : fallbackRun({ game: 'roulette', pocket, key: 0 }, 4200));
    await pause(RESULT_BEAT_MS);
    if (!mounted.current) return;
    const { settlement } = play;
    setRouletteResult(settlement);
    setRoulettePhase('result');
    setSlip((current) =>
      totalStake(current) > play.state.casino.chips ? [] : current,
    );
    if (settlement.won) {
      audio.win(
        play.settlement.bets.some(
          (b) => b.won && b.placed.bet.kind === 'straight',
        ),
      );
      stage.current?.celebrate('win');
      say(
        settlement.bets.some((b) => b.won && b.placed.bet.kind === 'straight')
          ? 'roulette-straight'
          : 'roulette-win',
        true,
      );
    } else {
      say('roulette-lose');
    }
    if (play.toppedUp) say('top-up');
    working.current = false;
    setBusy(false);
  }, [audio, fallbackRun, live, model, reducedMotion, say, slip]);

  const spinSlots = useCallback(async () => {
    if (working.current) return;
    audio.unlock();
    const play = model.spinSlots();
    if (!play.ok) {
      setMessage(play.message);
      if (play.reason === 'closed') say('closing', true);
      return;
    }
    working.current = true;
    setBusy(true);
    setMessage(null);
    setSlotsResult(null);
    setSlotsPhase('spinning');
    const { stops, evaluation } = play.outcome;
    audio.slotsStart();
    for (let reel = 0; reel < 3; reel += 1) {
      const plan = planReel({ start: 0, stop: 0, reel, reducedMotion });
      setTimeout(
        () => audio.reelStop(reel),
        (plan.delay + plan.seconds) * 1000,
      );
    }
    await (live && stage.current
      ? stage.current.spinSlots(stops)
      : fallbackRun({ game: 'slots', stops, key: 0 }, 3200));
    await pause(RESULT_BEAT_MS);
    if (!mounted.current) return;
    setSlotsResult({
      evaluation,
      net: play.returned - play.staked,
    });
    setSlotsPhase('result');
    if (evaluation.class !== 'miss') {
      const big = evaluation.class === 'jackpot';
      audio.win(big);
      stage.current?.celebrate(big ? 'jackpot' : 'win');
      if (!big)
        say(
          evaluation.class === 'triple' ? 'slots-triple' : 'slots-pair',
          true,
        );
    } else {
      say('slots-miss');
    }
    if (play.toppedUp) say('top-up');
    working.current = false;
    setBusy(false);
  }, [audio, fallbackRun, live, model, reducedMotion, say]);

  /* ---------------- Interface ---------------- */

  const back = () => {
    if (working.current) return;
    goTo('lobby');
    setRoulettePhase('betting');
    setSlotsPhase('ready');
  };

  const soundOn = model.state.casino.soundOn;
  const toggleSound = () => {
    const next = !soundOn;
    audio.setEnabled(next);
    if (next) audio.unlock();
    model.setSound(next);
  };

  const waiting = pending.filter((r) => later.has(r.id)).length;
  const rouletteLeft = spinsRemaining(model.state.casino, 'roulette');
  const slotsLeft = spinsRemaining(model.state.casino, 'slots');
  const stake = useMemo(() => totalStake(slip), [slip]);
  const dimmed = revealing !== null;
  const chips = model.chips;

  const onFallback = useCallback(() => setRender('poster'), []);

  return (
    <section
      className="casino"
      data-render={render}
      data-station={view}
      data-ready={panelOpen ? 'true' : 'false'}
      aria-labelledby="casino-title"
      onPointerDown={() => audio.unlock()}
    >
      <div className="casino-poster" aria-hidden="true">
        <div className="casino-poster__chandelier" />
        <div className="casino-poster__wall" />
        <div className="casino-poster__table" />
        <div className="casino-poster__machine" />
        <div className="casino-poster__floor" />
      </div>
      {render !== 'poster' && (
        <Suspense fallback={null}>
          <CasinoCanvas
            ref={stage}
            station={view}
            reducedMotion={reducedMotion}
            dimmed={dimmed}
            stake={stake}
            onReady={() => setRender((m) => (m === 'loading' ? 'fading' : m))}
            onFallback={onFallback}
            onSelect={(target) => goTo(target)}
            onLever={() => {
              if (view === 'slots' && panelOpen) void spinSlots();
            }}
            onArrive={(station) => setArrived(station)}
          />
        </Suspense>
      )}

      {render === 'poster' && view !== 'lobby' && (
        <FallbackStage
          game={view}
          spin={fallbackSpin}
          reducedMotion={reducedMotion}
        />
      )}

      {live && view === 'lobby' && (
        <>
          <span
            className="casino__mark casino__mark--roulette"
            aria-hidden="true"
          >
            Roulette
          </span>
          <span className="casino__mark casino__mark--slots" aria-hidden="true">
            The Machine
          </span>
        </>
      )}
      <div className="casino__flare" aria-hidden="true" />

      <div
        className="casino__frame"
        inert={collection !== null || revealing !== null}
      >
        <header className="casino__bar">
          {view === 'lobby' ? (
            <Link className="bar__back" to="/">
              <span aria-hidden="true">‹</span> Lounge
            </Link>
          ) : (
            <button
              type="button"
              className="bar__back"
              onClick={back}
              disabled={busy}
            >
              <span aria-hidden="true">‹</span> Lobby
            </button>
          )}
          <div className="bar__title">
            <p className="bar__eyebrow">The Thirty Club</p>
            <h1 id="casino-title">The Grand Casino</h1>
          </div>
          <div className="bar__tools">
            <span className="bar__chips" aria-label={`${chips} chips`}>
              <i aria-hidden="true" />
              {chips.toLocaleString('en-GB')}
            </span>
            <button
              type="button"
              className="bar__icon"
              aria-pressed={soundOn}
              aria-label={soundOn ? 'Sound on' : 'Sound off'}
              onClick={toggleSound}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
              >
                <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" />
                {soundOn ? (
                  <path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a8 8 0 0 1 0 11" />
                ) : (
                  <path d="M16 9.5l5 5M21 9.5l-5 5" />
                )}
              </svg>
            </button>
            <button
              type="button"
              className="bar__icon"
              aria-label={`Your collection${waiting ? `, ${waiting} waiting` : ''}`}
              onClick={(e) => setCollection({ opener: e.currentTarget })}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
              >
                <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.3l6-.7z" />
              </svg>
              {waiting > 0 && <b className="bar__dot" aria-hidden="true" />}
            </button>
          </div>
        </header>

        <div className="casino__voice" aria-live="polite">
          {butler.speech && (
            <figure key={butler.speech.key} className="voice">
              <blockquote>{butler.speech.text}</blockquote>
              <figcaption>The Butler</figcaption>
            </figure>
          )}
        </div>

        {render === 'loading' && (
          <p className="casino__loading" role="status">
            Preparing the tables…
          </p>
        )}

        {view === 'lobby' &&
          (render === 'poster' ||
            render === 'scene' ||
            render === 'fading') && (
            <nav className="casino__doors" aria-label="Choose a game">
              <button
                type="button"
                className="casino-door casino-door--roulette"
                onClick={() => goTo('roulette')}
                disabled={busy}
              >
                <span>Roulette</span>
                <small>European, one zero</small>
              </button>
              <button
                type="button"
                className="casino-door casino-door--slots"
                onClick={() => goTo('slots')}
                disabled={busy}
              >
                <span>The Machine</span>
                <small>Three reels</small>
              </button>
            </nav>
          )}

        {panelOpen && (
          <div ref={panelRef} className="casino__panel" tabIndex={-1}>
            {view === 'roulette' ? (
              <RoulettePanel
                chips={chips}
                slip={slip}
                onSlip={setSlip}
                phase={roulettePhase}
                result={rouletteResult}
                message={message}
                onSpin={() => void spinRoulette()}
                spinsLeft={rouletteLeft}
                onChip={() => audio.chip()}
              />
            ) : (
              <SlotsPanel
                phase={slotsPhase}
                result={slotsResult?.evaluation ?? null}
                net={slotsResult?.net ?? 0}
                chips={chips}
                message={message}
                onSpin={() => void spinSlots()}
                spinsLeft={slotsLeft}
              />
            )}
          </div>
        )}

        {waiting > 0 && !revealing && (
          <button
            type="button"
            className="casino__waiting"
            onClick={() => setLater(new Set())}
          >
            {waiting === 1
              ? 'A prize is waiting'
              : `${waiting} prizes are waiting`}
          </button>
        )}
      </div>

      {revealing && (
        <RewardReveal
          key={revealing.id}
          reward={revealing}
          butlerLine={revealLine}
          reducedMotion={reducedMotion}
          onClaim={() => claimReward(revealing.id)}
          onLater={() => {
            setLater((current) => new Set(current).add(revealing.id));
            setRevealId(null);
          }}
          onDone={() => setRevealId(null)}
        />
      )}
      {collection && (
        <CollectionSheet
          views={model.views}
          onClaim={claimReward}
          onClose={() => setCollection(null)}
          returnFocusTo={collection.opener}
        />
      )}
      {film && <CasinoEntranceFilm onDone={() => setFilm(false)} />}
      {DevTools && (
        <Suspense fallback={null}>
          <DevTools model={model} />
        </Suspense>
      )}
    </section>
  );
}
