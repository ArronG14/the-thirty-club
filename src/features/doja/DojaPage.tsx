import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useReducedMotion } from '../../shared/ui/useReducedMotion';
import {
  EMPTY_LETTER,
  MAX_WORDS,
  validateLetter,
  wordCount,
  type DojaLetter,
} from './letter';
import './doja.css';

const ENDPOINT = '/.netlify/functions/fromdoja';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; letter: DojaLetter | null }
  | { kind: 'unavailable' };

async function readLetter(): Promise<DojaLetter | null> {
  const response = await fetch(ENDPOINT, { cache: 'no-store' });
  if (!response.ok) throw new Error('unavailable');
  const data = (await response.json()) as { letter: unknown };
  return data.letter === null ? null : validateLetter(data.letter);
}

function LetterPaper({
  letter,
  preview = false,
}: {
  letter: DojaLetter | null;
  preview?: boolean;
}) {
  return (
    <article
      className="doja-paper"
      aria-label={preview ? 'Live letter preview' : 'Doja’s letter'}
    >
      <div className="doja-paper__inner">
        <div className="doja-paper__crest" aria-hidden="true">
          ✦
        </div>
        {letter ? (
          <>
            <h1 className="doja-paper__salutation">
              Dearest {letter.addressedTo},
            </h1>
            <div className="doja-paper__message">{letter.message}</div>
            <div className="doja-paper__signature">
              <span>With Love,</span>
              <strong>{letter.from}</strong>
            </div>
          </>
        ) : (
          <div className="doja-paper__empty">
            <span aria-hidden="true">✧</span>
            <p>This paper is waiting for Doja’s words.</p>
          </div>
        )}
        <div className="doja-paper__foot" aria-hidden="true">
          A LETTER, KEPT CLOSE
        </div>
      </div>
    </article>
  );
}

function Editor({
  initial,
  onClose,
  onSaved,
}: {
  initial: DojaLetter | null;
  onClose(): void;
  onSaved(letter: DojaLetter): void;
}) {
  const [password, setPassword] = useState('');
  const [verified, setVerified] = useState(false);
  const [draft, setDraft] = useState<DojaLetter>(initial ?? EMPTY_LETTER);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    passwordRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled)',
      );
      if (!controls?.length) return;
      const first = controls[0]!;
      const last = controls[controls.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    if (verified) firstFieldRef.current?.focus();
  }, [verified]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch(`${ENDPOINT}?verify=1`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${password}` },
        cache: 'no-store',
      });
      if (response.ok) setVerified(true);
      else
        setNotice(
          response.status === 401
            ? 'That password does not open this desk.'
            : 'The desk is unavailable. Please try again.',
        );
    } catch {
      setNotice('The desk is unavailable. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    let letter: DojaLetter;
    try {
      letter = validateLetter(draft);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Please check the letter.',
      );
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${password}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(letter),
        cache: 'no-store',
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setNotice(
          response.status === 401
            ? 'The password is no longer accepted. Close and reopen the desk.'
            : (body.error ??
                'The letter could not be saved. Please try again.'),
        );
        return;
      }
      onSaved(letter);
      setNotice('Saved. This letter is now available on other devices.');
    } catch {
      setNotice('The letter could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const count = wordCount(draft.message);
  const preview =
    draft.addressedTo.trim() && draft.message.trim() && draft.from.trim()
      ? draft
      : null;

  return (
    <div
      className="doja-editor-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="doja-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="doja-editor-title"
      >
        <div className="doja-editor__head">
          <div>
            <p className="doja-editor__eyebrow">PRIVATE WRITING DESK</p>
            <h2 id="doja-editor-title">A note from Doja</h2>
          </div>
          <button
            type="button"
            className="doja-editor__close"
            onClick={onClose}
            aria-label="Close editor"
          >
            ×
          </button>
        </div>
        {!verified ? (
          <form
            onSubmit={(event) => void unlock(event)}
            className="doja-editor__gate"
          >
            <p>Your private letter is ready to write or revise.</p>
            <label htmlFor="doja-password">Password</label>
            <input
              id="doja-password"
              ref={passwordRef}
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button type="submit" disabled={busy}>
              {busy ? 'Opening…' : 'Open writing desk'}
            </button>
            {notice && (
              <p role="alert" className="doja-editor__notice">
                {notice}
              </p>
            )}
          </form>
        ) : (
          <div className="doja-editor__layout">
            <form
              onSubmit={(event) => void save(event)}
              className="doja-editor__form"
            >
              <label htmlFor="doja-to">Addressed to</label>
              <input
                id="doja-to"
                ref={firstFieldRef}
                maxLength={80}
                value={draft.addressedTo}
                onChange={(event) =>
                  setDraft({ ...draft, addressedTo: event.target.value })
                }
                placeholder="Alise"
                required
              />
              <label htmlFor="doja-message">Personal message</label>
              <textarea
                id="doja-message"
                maxLength={6000}
                value={draft.message}
                onChange={(event) =>
                  setDraft({ ...draft, message: event.target.value })
                }
                rows={10}
                required
              />
              <p className="doja-editor__count" data-over={count > MAX_WORDS}>
                {count} / {MAX_WORDS} words
              </p>
              <label htmlFor="doja-from">From</label>
              <input
                id="doja-from"
                maxLength={80}
                value={draft.from}
                onChange={(event) =>
                  setDraft({ ...draft, from: event.target.value })
                }
                placeholder="Doja"
                required
              />
              <button type="submit" disabled={busy || count > MAX_WORDS}>
                {busy ? 'Saving…' : 'Save letter'}
              </button>
              {notice && (
                <p role="status" className="doja-editor__notice">
                  {notice}
                </p>
              )}
            </form>
            <div className="doja-editor__preview">
              <p>LIVE PREVIEW</p>
              <LetterPaper letter={preview} preview />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default function DojaPage() {
  const reducedMotion = useReducedMotion();
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [stage, setStage] = useState<'intro' | 'leaving' | 'letter'>('intro');
  const [editing, setEditing] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sealRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    void readLetter().then(
      (letter) => {
        if (active) setLoad({ kind: 'ready', letter });
      },
      () => {
        if (active) setLoad({ kind: 'unavailable' });
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (stage === 'letter') headingRef.current?.focus({ preventScroll: true });
  }, [stage]);

  function reveal() {
    if (reducedMotion) setStage('letter');
    else {
      setStage('leaving');
      window.setTimeout(() => setStage('letter'), 240);
    }
  }

  function closeEditor() {
    setEditing(false);
    window.setTimeout(() => sealRef.current?.focus(), 0);
  }

  const letter = load.kind === 'ready' ? load.letter : null;
  return (
    <main className="doja-page" data-stage={stage}>
      {stage !== 'letter' ? (
        <section className="doja-intro" aria-label="A special delivery">
          <div className="doja-intro__rule" aria-hidden="true">
            <span>✦</span>
          </div>
          <p className="doja-intro__eyebrow">A PRIVATE DELIVERY</p>
          <h1>Madam, a rather special delivery has arrived.</h1>
          <p>
            It appears someone very dear to you has left a personal note in your
            care.
          </p>
          <p>Shall I present it to you?</p>
          <button type="button" onClick={reveal}>
            See Note
          </button>
        </section>
      ) : (
        <section className="doja-letter-scene" aria-label="A personal letter">
          <h1 ref={headingRef} tabIndex={-1} className="sr-only">
            A note from Doja
          </h1>
          <div className="doja-letter-scene__light" aria-hidden="true" />
          <div className="doja-letter-scene__stack" aria-hidden="true" />
          {load.kind === 'unavailable' ? (
            <div className="doja-paper doja-paper--status">
              <p>
                The note cannot be reached just now. Please refresh this page in
                a moment.
              </p>
            </div>
          ) : load.kind === 'loading' ? (
            <div className="doja-paper doja-paper--status">
              <p role="status">The paper is being prepared…</p>
            </div>
          ) : (
            <LetterPaper letter={letter} />
          )}
          <button
            ref={sealRef}
            type="button"
            className="doja-editor-seal"
            aria-label="Open Doja’s private writing desk"
            onClick={() => setEditing(true)}
          >
            <span aria-hidden="true">d</span>
          </button>
        </section>
      )}
      {editing && (
        <Editor
          initial={letter}
          onClose={closeEditor}
          onSaved={(saved) => setLoad({ kind: 'ready', letter: saved })}
        />
      )}
    </main>
  );
}
