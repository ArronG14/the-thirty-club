/**
 * One letter: a sealed envelope that is opened by hand, then the letter on
 * cream laid paper, then the Butler at the foot of the page. Motion uses
 * transform and opacity only; reduced motion cross-fades. The same view is
 * the Owner Console's preview, where every action is inert and says so.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type {
  MemberLetter,
  MemberLetterReply,
} from '../../../shared/concierge/types';
import { REPLY_MAX_LENGTH } from '../../../shared/correspondence/templates';
import { useReducedMotion } from '../../../shared/ui/useReducedMotion';
import { newIdempotencyKey } from '../../concierge/client/api';
import { Emblem, WaxSeal } from '../../concierge/ui/Artwork';
import {
  failureText,
  sendWord,
  thankButler,
  type DeskResult,
} from '../client/correspondenceApi';
import {
  ALREADY_THANKED,
  THANKS_ON_SCREEN,
  WORD_PROMPT,
  WORD_RECEIVED,
} from '../domain/butlerLines';
import { letterDate, paragraphs } from '../domain/format';
import './correspondence.css';

type Phase = 'sealed' | 'breaking' | 'unfolding' | 'reading';

/** Full-motion beats, in milliseconds: the seal, the flap, the sheet. */
const BEATS = { breaking: 520, unfolding: 1250 } as const;

export interface LetterPresentationProps {
  letter: MemberLetter;
  /** Preview: the owner's rehearsal. Nothing is recorded or sent. */
  preview?: boolean;
  /** Called once when the seal is broken (the server records it). */
  onOpen?(): void;
  /** Called with the server's updated letter after thanks. */
  onThanked?(letter: MemberLetter): void;
  onReplied?(reply: MemberLetterReply): void;
}

export function LetterPresentation({
  letter,
  preview = false,
  onOpen,
  onThanked,
  onReplied,
}: LetterPresentationProps) {
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(
    letter.openedAt && !preview ? 'reading' : 'sealed',
  );
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (phase === 'breaking' || phase === 'unfolding') {
      const next = phase === 'breaking' ? 'unfolding' : 'reading';
      const timer = setTimeout(
        () => setPhase(next),
        reducedMotion ? 0 : BEATS[phase],
      );
      return () => clearTimeout(timer);
    }
    if (phase === 'reading') titleRef.current?.focus({ preventScroll: true });
  }, [phase, reducedMotion]);

  function breakSeal() {
    if (phase !== 'sealed') return;
    onOpen?.();
    setPhase(reducedMotion ? 'reading' : 'breaking');
  }

  const date = letterDate(letter.deliveredAt, letter.timezone);

  return (
    <div
      className="cd-letter"
      data-phase={phase}
      data-motion={reducedMotion ? 'reduced' : 'full'}
    >
      {phase !== 'reading' && (
        <div className="cd-envelope-stage">
          <p className="cd-envelope-stage__addressee">
            For the personal attention of
            <span>Madam Alise Khera</span>
          </p>
          <button
            type="button"
            className="cd-envelope"
            onClick={breakSeal}
            disabled={phase !== 'sealed'}
            aria-label={`Break the seal and open the letter: ${letter.title}`}
          >
            <span className="cd-envelope__back" aria-hidden="true" />
            <span className="cd-envelope__sheet" aria-hidden="true">
              <span className="cd-envelope__sheet-line" />
              <span className="cd-envelope__sheet-line" />
              <span className="cd-envelope__sheet-line cd-envelope__sheet-line--short" />
            </span>
            <span className="cd-envelope__pocket" aria-hidden="true" />
            <span className="cd-envelope__flap" aria-hidden="true">
              <span className="cd-envelope__flap-outside" />
              <span className="cd-envelope__flap-inside" />
            </span>
            <span className="cd-envelope__seal" aria-hidden="true">
              <WaxSeal />
            </span>
          </button>
          <p className="cd-envelope-stage__title">{letter.title}</p>
          <p className="cd-envelope-stage__date">{date}</p>
          <p className="cd-envelope-stage__hint" aria-hidden="true">
            {phase === 'sealed' ? 'Touch the seal to open' : ' '}
          </p>
        </div>
      )}

      {phase === 'reading' && (
        <>
          <article className="cd-paper" aria-labelledby={titleId}>
            <header className="cd-paper__head">
              <Emblem />
              <p className="cd-paper__house">
                The Thirty Club · Correspondence
              </p>
              <span className="cd-paper__rule" aria-hidden="true" />
            </header>
            <p className="cd-paper__date">{date}</p>
            <h1
              id={titleId}
              ref={titleRef}
              tabIndex={-1}
              className="cd-paper__title"
            >
              {letter.title}
            </h1>
            <p className="cd-paper__salutation">{letter.salutation}</p>
            <div className="cd-paper__body">
              {paragraphs(letter.body).map((lines, index) => (
                <p key={index}>
                  {lines.map((line, n) => (
                    <span key={n}>
                      {n > 0 && <br />}
                      {line}
                    </span>
                  ))}
                </p>
              ))}
            </div>
            <p className="cd-paper__ornament" aria-hidden="true">
              ◆
            </p>
          </article>
          <ButlerAtTheFoot
            letter={letter}
            preview={preview}
            onThanked={onThanked}
            onReplied={onReplied}
          />
        </>
      )}
      <p className="sr-only" aria-live="polite">
        {phase === 'breaking'
          ? 'The seal is broken.'
          : phase === 'unfolding'
            ? 'The letter is unfolding.'
            : ''}
      </p>
    </div>
  );
}

type Busy = 'none' | 'thanking' | 'sending';

function ButlerAtTheFoot({
  letter,
  preview,
  onThanked,
  onReplied,
}: {
  letter: MemberLetter;
  preview: boolean;
  onThanked?: ((letter: MemberLetter) => void) | undefined;
  onReplied?: ((reply: MemberLetterReply) => void) | undefined;
}) {
  const [busy, setBusy] = useState<Busy>('none');
  const [speech, setSpeech] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  // One key per composed message, so a resend after a timeout is the same message.
  const [key, setKey] = useState(newIdempotencyKey);
  const [replies, setReplies] = useState(letter.replies);
  const [thanked, setThanked] = useState(Boolean(letter.thankedAt));
  const fieldId = useId();
  const countId = useId();
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (composing) field.current?.focus();
  }, [composing]);

  async function settle<T>(
    kind: Busy,
    request: () => Promise<DeskResult<T>>,
  ): Promise<T | null> {
    setBusy(kind);
    setProblem(null);
    const result = await request();
    setBusy('none');
    if (result.ok) return result.data;
    setProblem(failureText(result));
    return null;
  }

  async function thank() {
    if (preview) {
      setSpeech(THANKS_ON_SCREEN);
      return;
    }
    if (busy !== 'none') return;
    if (thanked) {
      setSpeech(ALREADY_THANKED);
      return;
    }
    const data = await settle('thanking', () => thankButler(letter.id));
    if (!data) return;
    setThanked(true);
    setComposing(false);
    setSpeech(data.duplicate ? ALREADY_THANKED : THANKS_ON_SCREEN);
    onThanked?.(data.letter);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const words = draft.trim();
    if (!words || busy !== 'none') return;
    if (preview) {
      setSpeech(WORD_RECEIVED);
      setComposing(false);
      return;
    }
    const data = await settle('sending', () => sendWord(letter.id, words, key));
    if (!data) return;
    setReplies((all) =>
      all.some((r) => r.id === data.reply.id) ? all : [...all, data.reply],
    );
    setDraft('');
    setKey(newIdempotencyKey());
    setComposing(false);
    setSpeech(WORD_RECEIVED);
    onReplied?.(data.reply);
  }

  return (
    <section className="cd-butler" aria-label="The Butler">
      {preview && (
        <p className="cd-butler__preview">
          Preview · these buttons record nothing and send nothing.
        </p>
      )}
      <div className="cd-butler__actions">
        <button
          type="button"
          className="cd-button"
          onClick={() => void thank()}
          disabled={busy !== 'none'}
          aria-describedby={thanked ? `${fieldId}-thanked` : undefined}
        >
          {busy === 'thanking' ? 'One moment…' : '✉️ Thank the Butler'}
        </button>
        <button
          type="button"
          className="cd-button cd-button--quiet"
          aria-expanded={composing}
          onClick={() => {
            setSpeech(null);
            setProblem(null);
            setComposing((c) => !c);
          }}
          disabled={busy !== 'none'}
        >
          🎩 Butler, A Word
        </button>
      </div>
      {thanked && !speech && (
        <p id={`${fieldId}-thanked`} className="cd-butler__note">
          You thanked the Butler for this letter.
        </p>
      )}

      <div className="cd-butler__voice" aria-live="polite">
        {speech && (
          <blockquote className="cd-butler__speech">
            <p>{speech}</p>
            <footer>— The Butler</footer>
          </blockquote>
        )}
        {problem && (
          <p className="cd-butler__problem" role="alert">
            {problem}
          </p>
        )}
      </div>

      {composing && (
        <form className="cd-word" onSubmit={(e) => void submit(e)}>
          <p className="cd-word__prompt">{WORD_PROMPT}</p>
          <label htmlFor={fieldId} className="sr-only">
            Your message to the Butler
          </label>
          <textarea
            id={fieldId}
            ref={field}
            className="cd-word__field"
            value={draft}
            maxLength={REPLY_MAX_LENGTH}
            rows={5}
            aria-describedby={countId}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write to the Butler…"
          />
          <p id={countId} className="cd-word__count">
            {REPLY_MAX_LENGTH - draft.length} characters remaining
          </p>
          <div className="cd-word__actions">
            <button
              type="submit"
              className="cd-button"
              disabled={busy !== 'none' || draft.trim().length === 0}
            >
              {busy === 'sending'
                ? 'Handing it over…'
                : 'Hand it to the Butler'}
            </button>
            <button
              type="button"
              className="cd-button cd-button--quiet"
              onClick={() => setComposing(false)}
              disabled={busy !== 'none'}
            >
              Never mind
            </button>
          </div>
        </form>
      )}

      {replies.length > 0 && (
        <section className="cd-replies" aria-label="Your words with the Butler">
          <h2 className="cd-replies__title">Your words with the Butler</h2>
          <ol>
            {replies.map((reply) => (
              <li key={reply.id}>
                <p>{reply.body}</p>
                <span>
                  Received{' '}
                  {new Intl.DateTimeFormat('en-GB', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(reply.createdAt))}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}
