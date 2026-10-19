/**
 * The Private Gift Vault. A real-time deposit chamber (or its CSS stand-in)
 * with the Butler's panel at the foot of the screen. Every compartment can
 * also be reached from the brass plaques in the dock, so nothing depends
 * on tapping the 3D scene. Server answers decide everything shown.
 */
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Link } from 'react-router';
import type { MemberVault } from '../../../shared/concierge/types';
import { useReducedMotion } from '../../../shared/ui/useReducedMotion';
import { canRender3D } from '../../entrance/scene/canRender3D';
import { createVaultSounds } from '../audio/vaultSounds';
import { plate, stateLabel, VAULT_LINES } from '../domain/vaultScript';
import type { VaultStage } from '../scene/VaultCanvas';
import type { VaultView } from '../scene/VaultScene';
import { useGiftVault, type VaultMode } from '../useGiftVault';
import { VaultLetter } from './VaultLetter';
import { VaultPoster } from './VaultPoster';
import './vault.css';
import { simulatedOwnerDocument, simulationActive } from '../../rehearsal/mode';

const VaultCanvas = lazy(() => import('../scene/VaultCanvas'));

type Render = 'loading' | 'fading' | 'scene' | 'poster';

/** Seconds the CSS stand-in takes to open a door (no 3D). */
const POSTER_OPENING_MS = 4200;
const POSTER_OPENING_REDUCED_MS = 700;
/** Longest the 3D ceremony may take before the letter is shown anyway. */
const CEREMONY_WATCHDOG_MS = 12_000;

export default function GiftVault({
  mode = { kind: 'member' },
}: {
  mode?: VaultMode;
  onComplete?(): void;
}) {
  const vault = useGiftVault(mode);
  const reducedMotion = useReducedMotion();
  const [render, setRender] = useState<Render>(() =>
    canRender3D() ? 'loading' : 'poster',
  );
  const [sound, setSound] = useState(true);
  const stage = useRef<VaultStage>(null);
  const sounds = useMemo(() => createVaultSounds(), []);
  const played = useRef<string | null>(null);
  const [posterOpening, setPosterOpening] = useState<string | null>(null);
  useEffect(() => () => sounds.dispose(), [sounds]);
  useEffect(() => sounds.setEnabled(sound), [sound, sounds]);

  const { opening, ceremonyDone } = vault;
  const live = render === 'scene' || render === 'fading';

  // Play each committed opening once, in 3D or in the CSS chamber. The
  // server has already recorded it; this is only the ceremony. The timer
  // lives in a ref: the 3D scene finishing its load mid-ceremony must not
  // cancel a CSS ceremony already under way.
  const done = useRef(ceremonyDone);
  const posterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    done.current = ceremonyDone;
  });
  useEffect(
    () => () => {
      if (posterTimer.current) clearTimeout(posterTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!opening || opening.stage !== 'turning') return;
    const token = `${opening.vault.id}:${opening.again}`;
    if (played.current === token) return;
    played.current = token;
    if (live && stage.current) {
      // The server has already opened it: the letter must never wait on a
      // scene that stalls. The watchdog fires only if the ceremony overruns.
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        done.current();
      };
      posterTimer.current = setTimeout(finish, CEREMONY_WATCHDOG_MS);
      void stage.current
        .playOpening(opening.vault.id, opening.again)
        .then(finish);
      return;
    }
    setPosterOpening(opening.vault.id);
    posterTimer.current = setTimeout(
      () => {
        posterTimer.current = null;
        setPosterOpening(null);
        done.current();
      },
      reducedMotion || opening.again
        ? POSTER_OPENING_REDUCED_MS
        : POSTER_OPENING_MS,
    );
  }, [live, opening, reducedMotion]);
  useEffect(() => {
    if (!opening) played.current = null;
  }, [opening]);

  const view: VaultView =
    vault.letter || opening?.stage === 'revealed'
      ? 'inside'
      : vault.focus
        ? 'focus'
        : 'chamber';
  const sealed =
    opening && opening.stage !== 'revealed' && !opening.again
      ? opening.vault.id
      : null;
  const states = useMemo(
    () =>
      Object.fromEntries(
        vault.vaults.map((v) => [
          v.id,
          vault.open ? v.state : ('locked' as const),
        ]),
      ),
    [vault.open, vault.vaults],
  );
  // The scene builds its layout once; a new set of compartments remounts it.
  const compartments = vault.vaults.map((v) => ({
    id: v.id,
    number: v.number,
    // A compartment opened by the server but not yet ceremonially opened is
    // built closed, so a scene created after an NFC scan still has a door to open.
    state: v.id === sealed ? ('ready' as const) : states[v.id]!,
  }));
  const layoutKey = compartments.map((c) => c.id).join(',');

  const turnKey = useCallback(() => {
    sounds.unlock();
    vault.turnKey();
  }, [sounds, vault]);

  // An owner preview returns to the office it came from; a Dev Mode
  // rehearsal is Alise's own journey and returns to the lounge.
  const owner =
    vault.rehearsal && !(simulationActive && mode.kind === 'member');
  const home = owner
    ? simulatedOwnerDocument
      ? '/concierge/owner/test?section=office&tab=vault'
      : '/concierge/owner?section=office&tab=vault'
    : '/';
  const chamber = vault.phase.kind === 'chamber';
  const ceremonyRunning = opening?.stage === 'turning';

  return (
    <main
      className="gift-vault"
      data-render={render}
      data-view={view}
      aria-labelledby="vault-title"
    >
      <VaultPoster
        vaults={vault.vaults}
        open={vault.open}
        focus={vault.focus?.id ?? null}
        sealed={sealed}
        opening={posterOpening}
        hidden={live}
        onSelect={vault.select}
      />
      {render !== 'poster' && chamber && compartments.length > 0 && (
        <Suspense fallback={null}>
          <VaultCanvas
            key={layoutKey}
            ref={stage}
            compartments={compartments}
            intro={!opening}
            focus={vault.focus?.id ?? null}
            view={view}
            states={states}
            sealed={sealed}
            reducedMotion={reducedMotion}
            onReady={() => setRender((r) => (r === 'loading' ? 'fading' : r))}
            onFallback={() => setRender('poster')}
            onSelect={vault.select}
            onMechanism={(kind) => sounds.play(kind)}
          />
        </Suspense>
      )}
      {live && (
        <div className="gift-vault__labels" aria-hidden="true">
          {vault.vaults.map((v) => (
            <span
              key={v.id}
              className="gift-vault__label"
              data-vault-label={v.id}
              data-state={states[v.id]}
              data-focus={vault.focus?.id === v.id ? 'true' : 'false'}
            >
              No. {plate(v.number)}
            </span>
          ))}
        </div>
      )}

      <header className="gift-vault__header">
        <Link to={home} className="gift-vault__back">
          {owner ? 'Butler’s Office' : 'The lounge'}
        </Link>
        <div className="gift-vault__titles">
          <p className="gift-vault__eyebrow">The Thirty Club</p>
          <h1 id="vault-title">The Private Gift Vault</h1>
        </div>
        <button
          type="button"
          className="gift-vault__sound"
          aria-pressed={sound}
          onClick={() => setSound((s) => !s)}
        >
          {sound ? 'Sound on' : 'Sound off'}
        </button>
      </header>
      {vault.rehearsal && (
        <p className="gift-vault__rehearsal" role="note">
          {simulationActive
            ? 'Rehearsal · the simulated vault; no real compartment is touched'
            : 'Owner rehearsal · nothing is opened, consumed, recorded or sent'}
        </p>
      )}

      <section className="gift-vault__panel" aria-label="The Butler">
        <p
          className="gift-vault__butler"
          aria-live="polite"
          key={vault.line?.key}
        >
          {vault.line?.text ?? ''}
        </p>
        {vault.phase.kind === 'arriving' && (
          <p className="gift-vault__status" role="status">
            The Butler is consulting the vault ledger…
          </p>
        )}
        {vault.phase.kind === 'unavailable' && (
          <div className="gift-vault__actions">
            <p className="gift-vault__status" role="alert">
              {vault.phase.message}
            </p>
            <button
              type="button"
              className="vault-button"
              onClick={vault.retry}
            >
              Try again
            </button>
          </div>
        )}
        {vault.phase.kind === 'needs-membership' && (
          <MembershipForm
            busy={vault.busy}
            onSubmit={vault.presentMembership}
          />
        )}
        {chamber && (
          <ChamberControls
            vault={vault}
            ceremonyRunning={ceremonyRunning}
            onTurn={turnKey}
          />
        )}
      </section>

      {vault.letter && (
        <VaultLetter
          vault={vault.letter}
          rehearsal={vault.rehearsal}
          reducedMotion={reducedMotion}
          onClose={vault.closeLetter}
        />
      )}
    </main>
  );
}

function ChamberControls({
  vault,
  ceremonyRunning,
  onTurn,
}: {
  vault: ReturnType<typeof useGiftVault>;
  ceremonyRunning: boolean;
  onTurn(): void;
}) {
  const { focus, opening, sheet } = vault;
  if (ceremonyRunning) return null;
  if (opening?.stage === 'awaiting-turn') {
    return (
      <div className="gift-vault__actions">
        <button
          type="button"
          className="vault-button vault-button--key"
          onClick={onTurn}
          autoFocus
        >
          {opening.again ? 'Open the compartment' : 'Turn the key'}
        </button>
      </div>
    );
  }
  if (focus && focus.state === 'ready' && vault.open && sheet === 'clue') {
    return (
      <div className="vault-clue">
        <p className="vault-clue__lead">{VAULT_LINES.clueLead}</p>
        <blockquote className="vault-clue__text">
          {focus.clue?.trim()
            ? focus.clue
            : 'The Butler is still composing this clue. Do look in again shortly.'}
        </blockquote>
        <p className="vault-clue__how">{VAULT_LINES.howToScan}</p>
        <div className="gift-vault__actions">
          {vault.rehearsal && (
            <button
              type="button"
              className="vault-button vault-button--key"
              disabled={vault.busy}
              onClick={() => void vault.simulateScan()}
            >
              Simulate finding the key
            </button>
          )}
          <button
            type="button"
            className="vault-button vault-button--quiet"
            onClick={() => vault.setSheet('code')}
          >
            Enter the key’s code
          </button>
          <button
            type="button"
            className="vault-button vault-button--quiet"
            onClick={vault.back}
          >
            Back to the vault
          </button>
        </div>
      </div>
    );
  }
  if (focus && focus.state === 'ready' && vault.open && sheet === 'code') {
    return <CodeForm vault={vault} focus={focus} />;
  }
  return (
    <>
      {focus && (
        <div className="gift-vault__actions">
          {focus.state === 'opened' && vault.open && !vault.letter && (
            <button
              type="button"
              className="vault-button"
              onClick={() => vault.select(focus.id)}
            >
              Read the envelope
            </button>
          )}
          <button
            type="button"
            className="vault-button vault-button--quiet"
            onClick={vault.back}
          >
            Back to the vault
          </button>
        </div>
      )}
      <nav className="vault-dock" aria-label="Your compartments">
        {vault.vaults.length === 0 && (
          <p className="gift-vault__status">
            No compartments have been assigned yet.
          </p>
        )}
        {vault.vaults.map((v) => {
          const state = vault.open ? v.state : 'locked';
          return (
            <button
              key={v.id}
              type="button"
              className="vault-plaque"
              data-state={state}
              aria-current={vault.focus?.id === v.id ? 'true' : undefined}
              onClick={() => vault.select(v.id)}
            >
              <span className="vault-plaque__number">
                No. {plate(v.number)}
              </span>
              <span className="vault-plaque__state">
                {stateLabel({ state })}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

function CodeForm({
  vault,
  focus,
}: {
  vault: ReturnType<typeof useGiftVault>;
  focus: MemberVault;
}) {
  const [code, setCode] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (code.trim()) void vault.submitCode(code);
  };
  return (
    <form className="vault-code" onSubmit={submit}>
      <p className="vault-clue__lead">{VAULT_LINES.codeLead}</p>
      <label className="vault-code__label" htmlFor="vault-backup-code">
        Code engraved on the key for No. {plate(focus.number)}
        <input
          id="vault-backup-code"
          className="vault-code__input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          maxLength={20}
          placeholder="XXXX-XXXX-XXXX"
          aria-invalid={vault.codeError ? true : undefined}
          aria-describedby={vault.codeError ? 'vault-code-error' : undefined}
          autoFocus
        />
      </label>
      {vault.codeError && (
        <p id="vault-code-error" className="vault-code__error" role="alert">
          {vault.codeError}
        </p>
      )}
      <div className="gift-vault__actions">
        <button
          type="submit"
          className="vault-button vault-button--key"
          disabled={vault.busy || !code.trim()}
        >
          {vault.busy ? 'The vault is listening…' : 'Present the code'}
        </button>
        <button
          type="button"
          className="vault-button vault-button--quiet"
          onClick={() => vault.setSheet('clue')}
        >
          Back to the clue
        </button>
      </div>
    </form>
  );
}

function MembershipForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit(code: string): Promise<string>;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim()) return;
    setError(await onSubmit(code));
  };
  return (
    <form className="vault-code" onSubmit={(e) => void submit(e)}>
      <p className="vault-clue__how">
        Tap your membership card to the top of your iPhone, or enter the number
        printed on it. Your key will wait for you.
      </p>
      <label className="vault-code__label" htmlFor="vault-membership">
        Membership number
        <input
          id="vault-membership"
          className="vault-code__input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          aria-invalid={error ? true : undefined}
        />
      </label>
      {error && (
        <p className="vault-code__error" role="alert">
          {error}
        </p>
      )}
      <div className="gift-vault__actions">
        <button
          type="submit"
          className="vault-button vault-button--key"
          disabled={busy || !code.trim()}
        >
          {busy ? 'Checking…' : 'Present my membership'}
        </button>
      </div>
    </form>
  );
}
