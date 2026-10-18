import { useEffect, useRef } from 'react';
import type { RewardView } from '../../prizes/rewards';
import { RewardArt } from './rewardArt';
import { KIND_LABEL } from './rewardLabels';

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

/** Everything the house has to give, won and still to win. */
export function CollectionSheet({
  views,
  onClaim,
  onClose,
  returnFocusTo,
}: {
  views: readonly RewardView[];
  onClaim(id: string): void;
  onClose(): void;
  returnFocusTo: HTMLElement | null;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const opener = returnFocusTo;
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [onClose, returnFocusTo]);
  const won = views.filter((v) => v.status !== 'locked').length;
  return (
    <div className="c-sheet">
      <div className="c-sheet__scrim" aria-hidden="true" onClick={onClose} />
      <div
        ref={panel}
        className="c-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-title"
        tabIndex={-1}
      >
        <p className="c-sheet__label">The Grand Casino</p>
        <h2 id="collection-title" className="c-sheet__title">
          Your collection
        </h2>
        <p className="c-sheet__count">
          {won} of {views.length} won
        </p>
        <ul className="collection">
          {views.map(({ definition, status, claimedAt }) => (
            <li
              key={definition.id}
              className="collection__item"
              data-status={status}
            >
              {status === 'locked' ? (
                <>
                  <span
                    className="collection__art collection__art--locked"
                    aria-hidden="true"
                  >
                    ?
                  </span>
                  <div>
                    <p className="collection__name">A prize yet to be won</p>
                    <p className="collection__meta">
                      {KIND_LABEL[definition.kind]} · from the{' '}
                      {definition.source === 'casino'
                        ? 'house'
                        : definition.source}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <span className="collection__art" aria-hidden="true">
                    <RewardArt reward={definition} />
                  </span>
                  <div>
                    <p className="collection__name">{definition.name}</p>
                    <p className="collection__meta">{definition.description}</p>
                    {status === 'claimed' ? (
                      <>
                        {definition.kind === 'vault-code' && (
                          <p className="collection__code">
                            Vault code <strong>{definition.unlockCode}</strong>
                          </p>
                        )}
                        <p className="collection__meta">
                          Claimed {claimedAt ? formatDate(claimedAt) : ''}
                        </p>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="collection__claim"
                        onClick={() => onClaim(definition.id)}
                      >
                        Claim it
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
        <button type="button" className="c-sheet__close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
