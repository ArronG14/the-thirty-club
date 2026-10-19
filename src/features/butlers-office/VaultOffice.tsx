/**
 * The Gift Vault in the Butler's Office: create and configure compartments,
 * make them ready, read their NFC links and backup codes, rehearse them.
 * Every action goes through owner-only endpoints; nothing here can name a
 * present, only where it is.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import { Link } from 'react-router';
import type {
  OwnerVault,
  VaultInput,
  VaultTrigger,
} from '../../shared/concierge/types';
import { instantToWall, wallTimeToInstant } from '../../shared/concierge/time';
import { CASINO_REWARDS } from '../casino/config/casinoRewards';
import {
  commandVault,
  failureText,
  ownerVaults,
  saveVault,
  type VaultCommand,
} from '../vault/client/vaultApi';
import { encodeQr, qrPath } from './qr';
import { simulatedOwnerDocument, TEST_CENTRE_PATH } from '../rehearsal/mode';

const plate = (n: number) => String(n).padStart(3, '0');
const when = (at: string | null, zone: string) =>
  at
    ? new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: zone,
      }).format(new Date(at))
    : '—';
const bothZones = (at: string | null) =>
  at
    ? `${when(at, 'America/Jamaica')} Jamaica · ${when(at, 'Europe/London')} UK`
    : '—';

const VAULT_REWARDS = CASINO_REWARDS.filter((r) => r.kind === 'vault-code');
const TRIGGERS: Record<VaultTrigger, string> = {
  manual: 'Manual (you make it ready)',
  scheduled: 'Scheduled date and time',
  casino: 'Won in the Grand Casino',
};
const STATES = { locked: 'Locked', ready: 'Ready', opened: 'Opened' } as const;

export function VaultOffice() {
  const [vaults, setVaults] = useState<OwnerVault[] | null>(null);
  const [opensAt, setOpensAt] = useState<string | null>(null);
  const [editing, setEditing] = useState<OwnerVault | 'new' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await ownerVaults();
    if (!result.ok) {
      setError(failureText(result));
      return;
    }
    setVaults(result.data.vaults);
    setOpensAt(result.data.opensAt);
  }, []);
  useEffect(() => {
    let active = true;
    void ownerVaults().then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(failureText(result));
        return;
      }
      setVaults(result.data.vaults);
      setOpensAt(result.data.opensAt);
    });
    return () => {
      active = false;
    };
  }, []);

  const replace = (vault: OwnerVault) =>
    setVaults((list) => {
      const rest = (list ?? []).filter((v) => v.id !== vault.id);
      return [...rest, vault].sort((a, b) => a.number - b.number);
    });

  async function command(
    vault: OwnerVault,
    verb: VaultCommand,
    confirmText?: string,
  ) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError('');
    setNotice('');
    const result = await commandVault(vault.id, verb);
    setBusy(false);
    if (!result.ok) {
      setError(failureText(result));
      return;
    }
    replace(result.data.vault);
    setNotice(
      `Compartment ${plate(vault.number)}: ${STATES[result.data.vault.state].toLowerCase()}.`,
    );
  }

  async function save(input: VaultInput, id?: string) {
    setBusy(true);
    setError('');
    setNotice('');
    const result = await saveVault(input, id);
    setBusy(false);
    if (!result.ok) {
      setError(
        result.kind === 'http' && result.status === 409
          ? 'That compartment number is already in use.'
          : failureText(result),
      );
      return false;
    }
    replace(result.data.vault);
    setEditing(null);
    setNotice(`Compartment ${plate(result.data.vault.number)} saved.`);
    return true;
  }

  const nextNumber = useMemo(
    () =>
      vaults && vaults.length
        ? Math.max(...vaults.map((v) => v.number)) + 1
        : 1,
    [vaults],
  );

  return (
    <section className="office-card office-vault">
      <h2>The Private Gift Vault</h2>
      <p className="office-hint">
        Each compartment has two separate notes: the <strong>NFC clue</strong>{' '}
        (where Alise should look for the tag, shown once the compartment is
        ready) and the <strong>gift location</strong> (where the wrapped present
        is, shown only after she opens it). Never write what the present is.
      </p>
      {opensAt && (
        <p className="office-hint">
          Birthday time-lock: nothing opens before {bothZones(opensAt)}.
          Scheduled times are stored as exact instants.
        </p>
      )}
      {error && (
        <p role="alert" className="office-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="office-notice">
          {notice}
        </p>
      )}
      {editing ? (
        <VaultForm
          value={editing === 'new' ? null : editing}
          suggestedNumber={nextNumber}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      ) : (
        <div className="office-actions">
          <button
            disabled={busy || vaults === null}
            onClick={() => setEditing('new')}
          >
            Create a compartment
          </button>
          <button disabled={busy} onClick={() => void load()}>
            Refresh vault
          </button>
        </div>
      )}
      {vaults === null && !error && (
        <p role="status">Opening the vault ledger…</p>
      )}
      {vaults?.length === 0 && <p>No compartments yet.</p>}
      <div className="office-vault__list">
        {vaults?.map((vault) => (
          <VaultCard
            key={vault.id}
            vault={vault}
            busy={busy}
            onEdit={() => setEditing(vault)}
            onCommand={(verb, confirmText) =>
              void command(vault, verb, confirmText)
            }
          />
        ))}
      </div>
    </section>
  );
}

function VaultCard({
  vault,
  busy,
  onEdit,
  onCommand,
}: {
  vault: OwnerVault;
  busy: boolean;
  onEdit(): void;
  onCommand(verb: VaultCommand, confirmText?: string): void;
}) {
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState('');
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${what} copied.`);
    } catch {
      setCopied('Copy failed; select the text instead.');
    }
  };
  const trigger =
    vault.trigger === 'scheduled'
      ? `Scheduled · ${bothZones(vault.availableAt)}`
      : vault.trigger === 'casino'
        ? `Casino · ${VAULT_REWARDS.find((r) => r.id === vault.casinoRewardId)?.name ?? vault.casinoRewardId}`
        : 'Manual';
  return (
    <article className="office-vault__card" data-state={vault.state}>
      <header className="office-vault__head">
        <h3>No. {plate(vault.number)}</h3>
        <span className="office-vault__state">{STATES[vault.state]}</span>
      </header>
      <dl className="office-vault__facts">
        <dt>Vault ID</dt>
        <dd>{vault.slug}</dd>
        <dt>Unlock trigger</dt>
        <dd>{trigger}</dd>
        <dt>Ready since</dt>
        <dd>{bothZones(vault.readyAt)}</dd>
        <dt>Opened</dt>
        <dd>
          {vault.openedAt
            ? `${bothZones(vault.openedAt)} · by ${vault.openedVia === 'nfc' ? 'NFC tag' : vault.openedVia === 'code' ? 'backup code' : 'you'}`
            : 'Not yet'}
        </dd>
        <dt>NFC clue</dt>
        <dd className="office-vault__text">
          {vault.clue || <em>Not written yet</em>}
        </dd>
        <dt>Gift location</dt>
        <dd className="office-vault__text">
          {vault.giftLocation || <em>Not written yet</em>}
        </dd>
        <dt>NFC URL</dt>
        <dd>
          <code className="office-vault__url">{vault.nfcUrl}</code>
        </dd>
        <dt>Backup code</dt>
        <dd>
          <code className="office-vault__code">{vault.backupCode}</code>
        </dd>
      </dl>
      <div className="office-actions">
        <button onClick={() => void copy(vault.nfcUrl, 'NFC URL')}>
          Copy NFC URL
        </button>
        <button onClick={() => void copy(vault.backupCode, 'Backup code')}>
          Copy code
        </button>
        <button aria-expanded={showQr} onClick={() => setShowQr((s) => !s)}>
          {showQr ? 'Hide QR' : 'Show QR'}
        </button>
      </div>
      {copied && (
        <p role="status" className="office-hint">
          {copied}
        </p>
      )}
      {showQr && (
        <Qr
          text={vault.nfcUrl}
          label={`QR code for compartment ${plate(vault.number)}`}
        />
      )}
      <div className="office-actions">
        <Link
          className="office-button-link"
          to={`${simulatedOwnerDocument ? TEST_CENTRE_PATH : '/owner'}/vault-preview/${vault.id}`}
        >
          Preview vault {plate(vault.number)}
        </Link>
        <button disabled={busy} onClick={onEdit}>
          Edit
        </button>
        {vault.state === 'locked' && (
          <button disabled={busy} onClick={() => onCommand('ready')}>
            Make ready
          </button>
        )}
        {vault.state === 'ready' && (
          <button disabled={busy} onClick={() => onCommand('lock')}>
            Return to locked
          </button>
        )}
        {vault.state !== 'opened' && (
          <button
            disabled={busy}
            onClick={() =>
              onCommand(
                'open',
                `Open compartment ${plate(vault.number)} for Alise now, without the tag? This cannot be undone.`,
              )
            }
          >
            Unlock now
          </button>
        )}
        <button
          disabled={busy}
          onClick={() =>
            onCommand(
              'rotate-credential',
              'Issue a new NFC URL? The tag already written will stop working and must be rewritten.',
            )
          }
        >
          New NFC URL
        </button>
        <button
          disabled={busy}
          onClick={() =>
            onCommand(
              'rotate-code',
              'Issue a new backup code? The old code will stop working.',
            )
          }
        >
          New backup code
        </button>
      </div>
    </article>
  );
}

function Qr({ text, label }: { text: string; label: string }) {
  const qr = useMemo(() => encodeQr(text), [text]);
  const size = qr.size + 8;
  return (
    <figure className="office-vault__qr">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={label}
        shapeRendering="crispEdges"
      >
        <rect width={size} height={size} fill="#fff" />
        <path d={qrPath(qr)} fill="#000" />
      </svg>
      <figcaption>
        For testing with a phone camera. Program the NFC sticker with the URL
        itself.
      </figcaption>
    </figure>
  );
}

function VaultForm({
  value,
  suggestedNumber,
  busy,
  onCancel,
  onSave,
}: {
  value: OwnerVault | null;
  suggestedNumber: number;
  busy: boolean;
  onCancel(): void;
  onSave(input: VaultInput, id?: string): Promise<boolean>;
}) {
  const [trigger, setTrigger] = useState<VaultTrigger>(
    value?.trigger ?? 'manual',
  );
  const [zone, setZone] = useState('America/Jamaica');
  const [error, setError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let availableAt: string | null = null;
    try {
      const local = String(form.get('availableAt') ?? '');
      if (trigger === 'scheduled') availableAt = wallTimeToInstant(local, zone);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Choose a date and time.');
      return;
    }
    setError('');
    void onSave(
      {
        displayNumber: Number(form.get('displayNumber')),
        clue: String(form.get('clue') ?? ''),
        giftLocation: String(form.get('giftLocation') ?? ''),
        trigger,
        availableAt,
        casinoRewardId:
          trigger === 'casino' ? String(form.get('casinoRewardId')) : null,
      },
      value?.id,
    );
  }
  return (
    <form className="office-form office-vault__form" onSubmit={submit}>
      <h3>
        {value
          ? `Edit compartment ${plate(value.number)}`
          : 'Create a compartment'}
      </h3>
      {value?.state === 'opened' && (
        <p className="office-hint">
          Already opened. You can still correct the location; Alise sees the
          latest wording when she returns.
        </p>
      )}
      <label>
        Engraved number
        <input
          name="displayNumber"
          type="number"
          min={1}
          max={999}
          required
          defaultValue={value?.number ?? suggestedNumber}
        />
      </label>
      <label>
        NFC clue — where to look for the tag
        <textarea
          name="clue"
          rows={3}
          maxLength={1000}
          defaultValue={value?.clue ?? ''}
          placeholder="A riddle that leads to the tag, never to the present."
        />
      </label>
      <label>
        Gift location — where the wrapped present is (revealed only after
        opening)
        <textarea
          name="giftLocation"
          rows={3}
          maxLength={1000}
          defaultValue={value?.giftLocation ?? ''}
          placeholder="Where to look: the piece of furniture, the shelf, the bag."
        />
      </label>
      <label>
        Unlock trigger
        <select
          value={trigger}
          onChange={(e) => setTrigger(e.target.value as VaultTrigger)}
        >
          {(Object.keys(TRIGGERS) as VaultTrigger[]).map((t) => (
            <option key={t} value={t}>
              {TRIGGERS[t]}
            </option>
          ))}
        </select>
      </label>
      {trigger === 'scheduled' && (
        <fieldset className="office-vault__when">
          <legend>Becomes ready at</legend>
          <label>
            Time zone
            <select value={zone} onChange={(e) => setZone(e.target.value)}>
              <option value="America/Jamaica">Jamaica</option>
              <option value="Europe/London">United Kingdom</option>
            </select>
          </label>
          <label>
            Date and time ({zone === 'America/Jamaica' ? 'Jamaica' : 'UK'})
            <input
              name="availableAt"
              type="datetime-local"
              required
              defaultValue={instantToWall(value?.availableAt ?? null, zone)}
              key={zone}
            />
          </label>
        </fieldset>
      )}
      {trigger === 'casino' && (
        <label>
          Casino reward that releases it
          <select
            name="casinoRewardId"
            defaultValue={value?.casinoRewardId ?? VAULT_REWARDS[0]?.id}
          >
            {VAULT_REWARDS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <span className="office-hint">
            Released by the server when the slots jackpot is recorded through
            the server play API. The casino screen does not use that API yet, so
            this trigger cannot fire until it does; you can always make it ready
            manually.
          </span>
        </label>
      )}
      {error && (
        <p role="alert" className="office-error">
          {error}
        </p>
      )}
      <div className="office-actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save compartment'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {!value && (
        <p className="office-hint">
          A unique NFC URL and backup code are generated on the server when you
          save.
        </p>
      )}
    </form>
  );
}
