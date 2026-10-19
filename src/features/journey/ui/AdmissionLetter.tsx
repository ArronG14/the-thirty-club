import { useEffect, useId, useRef, useState } from 'react';
import type { MemberAdmission } from '../../../shared/journey/contract';
import {
  ADMISSION_ROOM_NAMES,
  enterLabel,
} from '../../../shared/journey/templates';
import './admission.css';

/**
 * The Letter of Admission, presented by the Butler in the Members' Lounge
 * (ADR-020): a sealed card on a black-and-gold salver. Accepting is the
 * only way into a newly introduced room; "Later" keeps the letter, which
 * stays in the Lounge until she accepts it, on any device.
 */
export function AdmissionLetter({
  admission,
  onAccept,
  onLater,
  busy,
  error,
}: {
  admission: MemberAdmission;
  onAccept(): void;
  onLater(): void;
  busy: boolean;
  error: string | null;
}) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const letter = admission.letter!;
  const room = ADMISSION_ROOM_NAMES[admission.roomId];

  useEffect(() => {
    heading.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onLater();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [busy, onLater, opener]);

  return (
    <div className="admission" data-room={admission.roomId}>
      <div className="admission__scrim" aria-hidden="true" />
      <article
        className="admission__letter"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <p className="admission__crest" aria-hidden="true">
          <span>30</span>
        </p>
        <p className="admission__eyebrow">
          The Thirty Club · Letter of Admission
        </p>
        <h2
          id={titleId}
          ref={heading}
          tabIndex={-1}
          className="admission__room"
        >
          {room}
        </h2>
        <p className="admission__rule" aria-hidden="true">
          ◆
        </p>
        <p className="admission__body">{letter.body}</p>
        <p className="admission__signature">
          With the compliments of the committee,
          <span>The Butler</span>
        </p>
        {error && (
          <p className="admission__error" role="alert">
            {error}
          </p>
        )}
        <div className="admission__actions">
          <button
            type="button"
            className="admission__accept"
            onClick={onAccept}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? 'One moment…' : enterLabel(admission.roomId)}
          </button>
          <button
            type="button"
            className="admission__later"
            onClick={onLater}
            disabled={busy}
          >
            Keep it for later
          </button>
        </div>
      </article>
    </div>
  );
}
