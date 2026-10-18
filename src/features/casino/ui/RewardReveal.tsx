import { useEffect, useRef, useState } from 'react';
import type { RewardDefinition } from '../../prizes/rewards';
import { RewardArt } from './rewardArt';
import { KIND_LABEL } from './rewardLabels';

/**
 * A prize reveal: the room dims, a card turns over, the title and message
 * arrive. Tap the card (or press Skip) to jump to the end. The prize is
 * already saved before this opens, so closing it at any moment loses
 * nothing: it simply waits to be claimed.
 */
export function RewardReveal({
  reward,
  butlerLine,
  reducedMotion,
  onClaim,
  onLater,
  onDone,
}: {
  reward: RewardDefinition;
  butlerLine: string;
  reducedMotion: boolean;
  /** She added it to her collection (the card stays to show the code). */
  onClaim(): void;
  /** She chose to keep it for later: it stays unclaimed. */
  onLater(): void;
  /** She is finished with the card, claimed or not. */
  onDone(): void;
}) {
  const [stage, setStage] = useState(reducedMotion ? 3 : 0);
  const [claimed, setClaimed] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reducedMotion) return;
    const timers = [
      setTimeout(() => setStage(1), 250),
      setTimeout(() => setStage(2), 1500),
      setTimeout(() => setStage(3), 2500),
    ];
    return () => timers.forEach(clearTimeout);
  }, [reducedMotion]);

  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    panel.current?.focus();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') (claimed ? onDone : onLater)();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [claimed, onLater, onDone]);

  const finished = stage >= 3;
  return (
    <div className="reveal" data-stage={stage} data-claimed={claimed}>
      <div className="reveal__scrim" aria-hidden="true" />
      <div
        ref={panel}
        className="reveal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reveal-title"
        tabIndex={-1}
      >
        <p className="reveal__eyebrow">{KIND_LABEL[reward.kind]}</p>
        <button
          type="button"
          className="reveal__card"
          aria-label={finished ? 'Prize card' : 'Skip the reveal'}
          onClick={() => setStage(3)}
          tabIndex={finished ? -1 : 0}
        >
          <span className="reveal__face reveal__face--back" aria-hidden="true">
            <span className="reveal__crest">30</span>
          </span>
          <span className="reveal__face reveal__face--front">
            <RewardArt reward={reward} />
          </span>
        </button>
        <h2 id="reveal-title" className="reveal__title">
          {reward.name}
        </h2>
        <p className="reveal__message">{reward.revealMessage}</p>
        {claimed && reward.kind === 'vault-code' && reward.unlockCode && (
          <p className="reveal__code">
            <span>Vault code</span>
            <strong>{reward.unlockCode}</strong>
          </p>
        )}
        <p className="reveal__butler">
          <q>{butlerLine}</q>
          <small>The Butler</small>
        </p>
        <div className="reveal__actions">
          {!claimed ? (
            <>
              <button
                type="button"
                className="c-cta"
                disabled={!finished}
                onClick={() => {
                  setClaimed(true);
                  onClaim();
                }}
              >
                Add to my collection
              </button>
              {!finished ? (
                <button
                  type="button"
                  className="c-link"
                  onClick={() => setStage(3)}
                >
                  Skip
                </button>
              ) : (
                <button type="button" className="c-link" onClick={onLater}>
                  Keep it for later
                </button>
              )}
            </>
          ) : (
            <button type="button" className="c-cta" onClick={onDone}>
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
