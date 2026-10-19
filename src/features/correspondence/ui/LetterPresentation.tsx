/**
 * One letter: a sealed envelope that is opened by hand, then the letter on
 * cream laid paper, then the Butler at the foot of the page. Motion uses
 * transform and opacity only; reduced motion cross-fades. The same view is
 * the Owner Console's preview, where every action is inert and says so.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type {
  MemberLetter,
  MemberLetterReply,
} from '../../../shared/concierge/types';
import { useReducedMotion } from '../../../shared/ui/useReducedMotion';
import { Emblem, WaxSeal } from '../../concierge/ui/Artwork';
import { activeDesk, type ButlerDesk } from '../../butler-service/client/desk';
import { nextLine } from '../../butler-service/domain/dialogue';
import { RequestComposer } from '../../butler-service/ui/RequestComposer';
import { failureText, type DeskResult } from '../client/correspondenceApi';
import { ALREADY_THANKED } from '../domain/butlerLines';
import { letterDate, paragraphs } from '../domain/format';
import { RoomInvitations } from './RoomInvitations';
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
  /**
   * Called after thanks: with the server's updated letter, and whether she
   * had already thanked the Butler for it (nothing new was recorded).
   */
  onThanked?(letter: MemberLetter, duplicate: boolean): void;
  onReplied?(reply: MemberLetterReply): void;
  /** Where thanks and words go. Dev Mode rehearses; see butler-service. */
  desk?: Pick<ButlerDesk, 'thank' | 'reply' | 'mode'>;
}

export function LetterPresentation({
  letter,
  preview = false,
  onOpen,
  onThanked,
  onReplied,
  desk = activeDesk,
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
          {!preview && <RoomInvitations text={letter.body} />}
          <ButlerAtTheFoot
            letter={letter}
            preview={preview}
            onThanked={onThanked}
            onReplied={onReplied}
            desk={desk}
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

function ButlerAtTheFoot({
  letter,
  preview,
  onThanked,
  onReplied,
  desk,
}: {
  letter: MemberLetter;
  preview: boolean;
  onThanked?: ((letter: MemberLetter, duplicate: boolean) => void) | undefined;
  onReplied?: ((reply: MemberLetterReply) => void) | undefined;
  desk: Pick<ButlerDesk, 'thank' | 'reply' | 'mode'>;
}) {
  const [thanking, setThanking] = useState(false);
  const [speech, setSpeech] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [replies, setReplies] = useState(letter.replies);
  const [thanked, setThanked] = useState(Boolean(letter.thankedAt));
  const noteId = useId();

  async function settle<T>(
    request: () => Promise<DeskResult<T>>,
  ): Promise<T | null> {
    setThanking(true);
    setProblem(null);
    const result = await request();
    setThanking(false);
    if (result.ok) return result.data;
    setProblem(failureText(result));
    return null;
  }

  async function thank() {
    if (preview) {
      setSpeech(nextLine('thanks'));
      return;
    }
    if (thanking) return;
    if (thanked) {
      setSpeech(ALREADY_THANKED);
      onThanked?.(letter, true);
      return;
    }
    const data = await settle(() => desk.thank(letter.id));
    if (!data) return;
    setThanked(true);
    setComposing(false);
    setSpeech(data.duplicate ? ALREADY_THANKED : nextLine('thanks'));
    onThanked?.(data.letter, data.duplicate);
  }

  return (
    <section className="cd-butler" aria-label="The Butler">
      {preview && (
        <p className="cd-butler__preview">
          Preview · these buttons record nothing and send nothing.
        </p>
      )}
      {!preview && desk.mode === 'rehearsal' && (
        <p className="cd-butler__preview">
          Dev Mode rehearsal · nothing is recorded for Alise and no SMS is sent.
        </p>
      )}
      <div className="cd-butler__actions">
        <button
          type="button"
          className="cd-button"
          onClick={() => void thank()}
          disabled={thanking || composing}
          aria-describedby={thanked ? noteId : undefined}
        >
          {thanking ? 'One moment…' : 'Thank You, Butler'}
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
          disabled={thanking}
        >
          A Word, Butler
        </button>
      </div>
      {thanked && !speech && (
        <p id={noteId} className="cd-butler__note">
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
        <RequestComposer
          send={(body, key) =>
            preview
              ? Promise.resolve({
                  ok: true as const,
                  data: {
                    reply: { id: key, body, createdAt: '' },
                    duplicate: false,
                  },
                })
              : desk.reply(letter.id, body, key).then((result) => {
                  if (result.ok) {
                    const reply = result.data.reply;
                    setReplies((all) =>
                      all.some((r) => r.id === reply.id)
                        ? all
                        : [...all, reply],
                    );
                    onReplied?.(reply);
                  }
                  return result;
                })
          }
          onSent={() => {
            setComposing(false);
            setSpeech(nextLine('request-received'));
          }}
          onCancel={() => setComposing(false)}
        />
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
