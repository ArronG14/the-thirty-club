/**
 * The Gift Vault's journey: who is at the door, what the server says each
 * compartment is, which one Alise is looking at, the Butler's words, and
 * the opening ceremony. Presentation reads this; it decides nothing.
 *
 * The opening is committed by the server BEFORE the ceremony plays, so an
 * interrupted animation, a reload or a lost connection can never undo or
 * repeat it: the compartment simply reads OPENED next time.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  MemberVault,
  VaultOpenInput,
  VaultOpenResult,
  VaultPreview,
} from '../../shared/concierge/types';
import { httpConciergeApi } from '../concierge/client/api';
import { activeSession, saveSession } from '../concierge/client/sessionStore';
import { heldKey, releaseKey } from './client/pendingKey';
import { wasAnnounced, markAnnounced } from './client/announcements';
import {
  establishStanding,
  failureText,
  listVaults,
  openVault,
  previewVault,
  verifyVaultKey,
  type VaultFailure,
  type VaultResult,
} from './client/vaultApi';
import { ANNOUNCEMENT, arrivalLine, VAULT_LINES } from './domain/vaultScript';
import { simulationActive } from '../rehearsal/mode';

export type VaultMode =
  /** `arrivalKey`: a key carried in from an NFC scan (also held in storage). */
  | { kind: 'member'; arrivalKey?: string | null }
  /** Owner rehearsal of one compartment: read-only, nothing is recorded. */
  | { kind: 'preview'; vaultId: string };

export type VaultPhase =
  | { kind: 'arriving' }
  | { kind: 'needs-membership' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'chamber' };

export interface Opening {
  vault: MemberVault;
  /** `awaiting-turn`: the key is accepted; she turns it when ready. */
  stage: 'awaiting-turn' | 'turning' | 'revealed';
  /** The compartment was already open (a repeat scan). */
  again: boolean;
}

export type Sheet = 'clue' | 'code' | null;

interface Source {
  load(): Promise<VaultResult<{ open: boolean; vaults: MemberVault[] }>>;
  open(input: VaultOpenInput): Promise<VaultResult<VaultOpenResult>>;
}

function memberSource(): Source {
  return { load: listVaults, open: openVault };
}

/** Rehearsal: answers from the owner's preview payload; no member calls. */
function previewSource(preview: VaultPreview): Source {
  let opened = false;
  return {
    load: () =>
      Promise.resolve({
        ok: true,
        data: { open: true, vaults: [opened ? preview.opened : preview.ready] },
      }),
    open: () => {
      const again = opened;
      opened = true;
      return Promise.resolve({
        ok: true,
        data: { vault: preview.opened, alreadyOpened: again },
      });
    },
  };
}

const READ_MS = 5200;

export function useGiftVault(mode: VaultMode) {
  const [phase, setPhase] = useState<VaultPhase>({ kind: 'arriving' });
  const [vaults, setVaults] = useState<MemberVault[]>([]);
  const [open, setOpen] = useState(true);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [line, setLine] = useState<{ key: number; text: string } | null>(null);
  const [opening, setOpening] = useState<Opening | null>(null);
  const [letter, setLetter] = useState<MemberVault | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeError, setCodeError] = useState('');
  // Dev Mode (ADR-018): the member's own vault in the simulated office, so a
  // rehearsal may stand in for finding a tag.
  const [rehearsal, setRehearsal] = useState(
    mode.kind === 'preview' || simulationActive,
  );
  const source = useRef<Source>(memberSource());
  const queue = useRef<ReturnType<typeof setTimeout>[]>([]);
  const counter = useRef(0);
  const started = useRef(false);

  /** Speaks one or more beats; the last one stays until replaced. */
  const speak = useCallback((...beats: string[]) => {
    queue.current.forEach(clearTimeout);
    queue.current = [];
    beats.forEach((text, i) => {
      const show = () => {
        counter.current += 1;
        setLine({ key: counter.current, text });
      };
      if (i === 0) show();
      else queue.current.push(setTimeout(show, i * READ_MS));
    });
  }, []);
  useEffect(() => () => queue.current.forEach(clearTimeout), []);

  const replace = useCallback((vault: MemberVault) => {
    setVaults((list) => list.map((v) => (v.id === vault.id ? vault : v)));
  }, []);

  /** Interprets a server answer to a presented key. */
  const settle = useCallback(
    (result: VaultResult<VaultOpenResult>, fromSheet: boolean) => {
      if (result.ok) {
        const { vault, alreadyOpened } = result.data;
        replace(vault);
        setFocusId(vault.id);
        setSheet(null);
        setCodeError('');
        setOpening({ vault, stage: 'awaiting-turn', again: alreadyOpened });
        speak(
          alreadyOpened
            ? VAULT_LINES.keyAcceptedAgain
            : VAULT_LINES.keyAccepted,
        );
        return true;
      }
      const message = rejection(result);
      if (fromSheet) setCodeError(message);
      speak(message);
      return false;
    },
    [replace, speak],
  );

  const refresh = useCallback(async () => {
    const result = await source.current.load();
    if (!result.ok) return result;
    setVaults(result.data.vaults);
    setOpen(result.data.open);
    return result;
  }, []);

  const arrive = useCallback(async () => {
    setPhase({ kind: 'arriving' });
    if (mode.kind === 'preview') {
      const preview = await previewVault(mode.vaultId);
      if (!preview.ok) {
        setPhase({ kind: 'unavailable', message: failureText(preview) });
        return;
      }
      source.current = previewSource(preview.data);
      await refresh();
      setPhase({ kind: 'chamber' });
      setFocusId(preview.data.ready.id);
      setSheet('clue');
      speak(...ANNOUNCEMENT, VAULT_LINES.readyIntro(preview.data.ready.number));
      return;
    }
    const standing = await establishStanding();
    if (standing.kind === 'unavailable') {
      setPhase({ kind: 'unavailable', message: failureText(standing.failure) });
      return;
    }
    if (standing.kind === 'needs-membership') {
      setPhase({ kind: 'needs-membership' });
      speak(VAULT_LINES.needsMembership);
      return;
    }
    const carried = mode.arrivalKey ?? null;
    const key =
      heldKey() ??
      (carried ? { credential: carried, foundAt: Date.now() } : null);
    const consumeKey = () => {
      releaseKey();
      // Clear the history entry's copy so a reload does not present it again.
      try {
        window.history.replaceState(null, '');
      } catch {
        // History unavailable: the server answers repeats idempotently anyway.
      }
    };
    if (standing.kind === 'owner') {
      // The owner's phone at a tag: identify it, rehearse it, change nothing.
      if (!key) {
        setPhase({
          kind: 'unavailable',
          message:
            'You are signed in to the Butler’s Office on this device. Use Preview in the office to rehearse a compartment.',
        });
        return;
      }
      consumeKey();
      const verified = await verifyVaultKey({ credential: key.credential });
      if (!verified.ok) {
        setPhase({ kind: 'unavailable', message: rejection(verified) });
        return;
      }
      const preview = await previewVault(verified.data.vaultId);
      if (!preview.ok) {
        setPhase({ kind: 'unavailable', message: failureText(preview) });
        return;
      }
      source.current = previewSource(preview.data);
      setRehearsal(true);
      await refresh();
      setPhase({ kind: 'chamber' });
      settle(await source.current.open({ credential: key.credential }), false);
      speak(
        VAULT_LINES.ownerTag(verified.data.number),
        VAULT_LINES.keyAccepted,
      );
      return;
    }
    const listed = await refresh();
    if (!listed.ok) {
      setPhase({ kind: 'unavailable', message: failureText(listed) });
      return;
    }
    setPhase({ kind: 'chamber' });
    if (key) {
      const result =
        key.credential === 'unrecognised'
          ? ({
              ok: false,
              kind: 'http',
              status: 404,
              code: 'credential-invalid',
              message: '',
            } as const)
          : await source.current.open({ credential: key.credential });
      // Keep the key only while the answer could still change (no reply yet).
      if (result.ok || result.kind === 'http') consumeKey();
      settle(result, false);
      return;
    }
    const fresh = listed.data.open
      ? listed.data.vaults.filter(
          (v) => v.state === 'ready' && !wasAnnounced(v.id),
        )
      : [];
    if (fresh.length > 0) {
      fresh.forEach((v) => markAnnounced(v.id));
      speak(...ANNOUNCEMENT);
    } else {
      speak(arrivalLine(listed.data.vaults, listed.data.open));
    }
  }, [mode, refresh, settle, speak]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void arrive();
  }, [arrive]);

  const select = useCallback(
    (id: string) => {
      if (opening && opening.stage !== 'revealed') return;
      const vault = vaults.find((v) => v.id === id);
      if (!vault) return;
      setFocusId(id);
      setCodeError('');
      setOpening(null);
      setLetter(null);
      if (!open || vault.state === 'locked') {
        setSheet(null);
        speak(open ? VAULT_LINES.locked(vault.number) : VAULT_LINES.timeLocked);
      } else if (vault.state === 'ready') {
        setSheet('clue');
        speak(VAULT_LINES.readyIntro(vault.number));
      } else {
        setSheet(null);
        setLetter(vault);
        speak(VAULT_LINES.revisit(vault.number));
      }
    },
    [open, opening, speak, vaults],
  );

  const back = useCallback(() => {
    if (opening && opening.stage === 'turning') return;
    setFocusId(null);
    setSheet(null);
    setLetter(null);
    setOpening(null);
    setCodeError('');
  }, [opening]);

  const submitCode = useCallback(
    async (code: string) => {
      if (busy) return;
      setBusy(true);
      setCodeError('');
      settle(await source.current.open({ code }), true);
      setBusy(false);
    },
    [busy, settle],
  );

  /** Rehearsal only: stands in for finding and scanning the tag. */
  const simulateScan = useCallback(async () => {
    if (!rehearsal || busy) return;
    setBusy(true);
    if (mode.kind === 'member' && simulationActive && focusId) {
      // The simulated compartment's own NFC token, as if the tag was scanned.
      const { rehearsalKeyFor } = await import('../rehearsal/office');
      const credential = await rehearsalKeyFor(focusId).catch(() => null);
      settle(
        await source.current.open(credential ? { credential } : {}),
        false,
      );
    } else settle(await source.current.open({}), false);
    setBusy(false);
  }, [busy, focusId, mode.kind, rehearsal, settle]);

  const turnKey = useCallback(() => {
    setOpening((o) =>
      o && o.stage === 'awaiting-turn' ? { ...o, stage: 'turning' } : o,
    );
    speak(VAULT_LINES.turning);
  }, [speak]);

  /** The ceremony has reached the envelope (or was skipped). */
  const ceremonyDone = useCallback(() => {
    if (!opening || opening.stage === 'revealed') return;
    setLetter(opening.vault);
    setOpening({ ...opening, stage: 'revealed' });
    speak(VAULT_LINES.revealed);
  }, [opening, speak]);

  const presentMembership = useCallback(
    async (code: string) => {
      if (busy) return '';
      setBusy(true);
      const result = await httpConciergeApi.activate(
        { code },
        activeSession()?.token,
      );
      setBusy(false);
      if (!result.ok) {
        return result.kind === 'http' && result.status < 500
          ? 'The vault does not recognise that membership number.'
          : 'The club did not answer. Please try again in a moment.';
      }
      saveSession(result.data.session);
      await arrive();
      return '';
    },
    [arrive, busy],
  );

  const focus = vaults.find((v) => v.id === focusId) ?? null;
  return {
    phase,
    vaults,
    open,
    focus,
    sheet,
    setSheet,
    line,
    opening,
    letter,
    busy,
    codeError,
    rehearsal,
    select,
    back,
    submitCode,
    simulateScan,
    turnKey,
    ceremonyDone,
    closeLetter: () => setLetter(null),
    presentMembership,
    retry: () => void arrive(),
  };
}

function rejection(result: VaultFailure): string {
  if (result.kind !== 'http') return failureText(result);
  switch (result.code) {
    case 'credential-invalid':
      return VAULT_LINES.wrongKey;
    case 'vault-locked':
      return VAULT_LINES.lockedKey;
    case 'not-open':
      return VAULT_LINES.tooEarly;
    case 'rate-limited':
      return VAULT_LINES.tooMany;
    case 'unauthorised':
      return VAULT_LINES.needsMembership;
    default:
      return VAULT_LINES.unavailable;
  }
}
