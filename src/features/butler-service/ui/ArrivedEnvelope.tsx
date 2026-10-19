/**
 * The newest unread letter, waiting at the doors (or in the lounge): the
 * same sealed envelope as the letter on the step, a little larger and lit.
 * Touching it opens the letter with its existing seal-breaking animation.
 */
import type { MemberLetter } from '../../../shared/concierge/types';
import { WaxSeal } from '../../concierge/ui/Artwork';
import '../../concierge/ui/entranceConcierge.css';
import './arrived.css';

export function ArrivedEnvelope({
  unread,
  onOpen,
  compact = false,
}: {
  unread: readonly MemberLetter[];
  onOpen(id: string): void;
  compact?: boolean;
}) {
  const newest = unread[0];
  if (!newest) return null;
  const more = unread.length - 1;
  return (
    <button
      type="button"
      className="step-letter arrived-letter"
      data-ready="true"
      data-compact={compact}
      onClick={() => onOpen(newest.id)}
      aria-label={`Open your new letter: ${newest.title}${more > 0 ? `. ${more} more unread.` : ''}`}
    >
      <span className="step-letter__envelope" aria-hidden="true">
        <span className="step-letter__flap" />
        <span className="step-letter__seal">
          <WaxSeal lit />
        </span>
      </span>
      <span className="arrived-letter__text" aria-hidden="true">
        <span className="step-letter__caption">
          {more > 0
            ? `${unread.length} letters have arrived`
            : 'A letter has arrived'}
        </span>
        <span className="arrived-letter__title">{newest.title}</span>
      </span>
    </button>
  );
}
