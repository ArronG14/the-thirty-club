/**
 * The Butler notices waiting correspondence when Alise arrives, at the
 * entrance before the birthday and in the lounge afterwards. Only a
 * recognised member hears him; nothing appears for anyone else, offline,
 * or when the office cannot be reached. "Later" holds him back until
 * another letter arrives.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { WaxSeal } from '../../concierge/ui/Artwork';
import {
  correspondenceSummary,
  memberStanding,
} from '../client/correspondenceApi';
import { waitingLine } from '../domain/butlerLines';
import './notice.css';

const DISMISSED_KEY = 'thirty-club:correspondence-later';

function dismissedAt(): number {
  try {
    return Number(sessionStorage.getItem(DISMISSED_KEY) ?? '-1');
  } catch {
    return -1;
  }
}

export default function CorrespondenceNotice({
  delayMs = 2500,
}: {
  delayMs?: number | undefined;
}) {
  const [unread, setUnread] = useState(0);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void (async () => {
        const standing = await memberStanding();
        if (!active || standing.kind !== 'member') return;
        const summary = await correspondenceSummary();
        if (!active || !summary.ok) return;
        const count = summary.data.unread;
        // Held back for this visit unless more has arrived since "Later".
        if (count > 0 && count > dismissedAt()) setUnread(count);
      })();
    }, delayMs);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [delayMs]);

  if (unread === 0 || hidden) return null;
  return (
    <aside className="cd-notice" aria-label="The Butler" role="status">
      <span className="cd-notice__seal" aria-hidden="true">
        <WaxSeal />
      </span>
      <p className="cd-notice__line">{waitingLine(unread)}</p>
      <div className="cd-notice__actions">
        <Link to="/correspondence" className="cd-notice__go">
          {unread === 1 ? 'Shall we take a look?' : 'Show me my letters'}
        </Link>
        <button
          type="button"
          className="cd-notice__later"
          onClick={() => {
            try {
              sessionStorage.setItem(DISMISSED_KEY, String(unread));
            } catch {
              /* nothing to remember with */
            }
            setHidden(true);
          }}
        >
          Later
        </button>
      </div>
    </aside>
  );
}
