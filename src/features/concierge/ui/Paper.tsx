import {
  useEffect,
  useRef,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { Emblem } from './Artwork';

/** Concierge correspondence on the club's laid paper. */
export function ConciergeLetter({
  greeting,
  paragraphs,
  signOff,
  children,
  className = '',
}: PropsWithChildren<{
  greeting: string;
  paragraphs: readonly string[];
  signOff?: string;
  className?: string;
}>) {
  return (
    <article className={`letter paper ${className}`}>
      <header className="letter__head">
        <Emblem />
        <p className="letter__house">The Thirty Club · Concierge</p>
      </header>
      <p className="letter__greeting">{greeting}</p>
      {paragraphs.map((paragraph) => (
        <p key={paragraph} className="letter__body">
          {paragraph}
        </p>
      ))}
      {signOff && <p className="letter__signoff">{signOff}</p>}
      {children}
    </article>
  );
}

/**
 * A modal sheet of paper rising from the foot of the screen. Focus moves in
 * and returns to the opener on close (Safari does not focus buttons on
 * click, so the opener is passed explicitly).
 */
export function PaperSheet({
  labelledBy,
  returnFocusTo,
  onClose,
  closeLabel = 'Close',
  footer,
  children,
}: PropsWithChildren<{
  labelledBy: string;
  returnFocusTo: HTMLElement | null;
  onClose(): void;
  closeLabel?: string;
  footer?: ReactNode;
}>) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      returnFocusTo?.focus();
    };
  }, [returnFocusTo]);

  return (
    <div className="paper-sheet">
      <div
        className="paper-sheet__scrim"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panel}
        className="paper-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        {children}
        <div className="paper-sheet__foot">
          {footer}
          <button type="button" className="quiet-button" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
