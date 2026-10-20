import { useId, useState } from 'react';
import { WaxSeal } from '../../concierge/ui/Artwork';
import { ConciergeLetter, PaperSheet } from '../../concierge/ui/Paper';
import type { EarlyLetter as Letter } from '../domain/earlyAdmission';
import '../../concierge/ui/entranceConcierge.css';

/**
 * The Butler's 19:00 letter on the step (ADR-023): the early admission, the
 * card's delivery and the owner's clue to where it is. The server shows it
 * at the doors only once 19:00 has fired; it uses the step letter's
 * envelope and paper, so it reads as one more letter from the house.
 */
export function EarlyLetter({ letter }: { letter: Letter }) {
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const paragraphs = letter.body
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <>
      {!open && (
        <button
          type="button"
          className="step-letter"
          data-ready="true"
          onClick={(event) => {
            setOpener(event.currentTarget.parentElement);
            setOpen(true);
          }}
        >
          <span className="step-letter__envelope" aria-hidden="true">
            <span className="step-letter__flap" />
            <span className="step-letter__seal">
              <WaxSeal />
            </span>
          </span>
          <span className="step-letter__caption">{letter.title}</span>
        </button>
      )}
      {open && (
        <PaperSheet
          labelledBy={titleId}
          returnFocusTo={opener}
          onClose={() => setOpen(false)}
        >
          <h2 id={titleId} className="sr-only">
            {letter.title}
          </h2>
          <ConciergeLetter
            greeting="Madam,"
            paragraphs={paragraphs}
            signOff="— The Butler"
          />
        </PaperSheet>
      )}
    </>
  );
}
