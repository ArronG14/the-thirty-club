import { useState } from 'react';

/**
 * Alise's membership card: black lacquer, engine-turned, brass-edged.
 * Wording and the member number await owner approval (D02).
 */
export function MembershipCard({
  presenting = false,
}: {
  presenting?: boolean;
}) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  return (
    <div
      className="member-card"
      data-presenting={presenting ? 'true' : 'false'}
    >
      <div className="member-card__turn" data-side={side}>
        <section
          className="member-card__face member-card__face--front"
          aria-label="Membership card, front"
          aria-hidden={side !== 'front'}
        >
          <span className="member-card__sheen" aria-hidden="true" />
          <header className="member-card__head">
            <span className="member-card__club">The Thirty Club</span>
            <span className="member-card__est">Est. MMXXVI</span>
          </header>
          <span className="member-card__emblem" aria-hidden="true">
            <span>30</span>
          </span>
          <p className="member-card__name">Alise</p>
          <p className="member-card__rank">Founding member · Lifetime</p>
          <dl className="member-card__meta">
            <div>
              <dt>Member</dt>
              <dd>No. 1 of 1</dd>
            </div>
            <div>
              <dt>Since</dt>
              <dd>24 · X · MMXXVI</dd>
            </div>
          </dl>
        </section>
        <section
          className="member-card__face member-card__face--back"
          aria-label="Membership card, back"
          aria-hidden={side !== 'back'}
        >
          <span className="member-card__stripe" aria-hidden="true" />
          <p className="member-card__terms">
            This card admits its bearer to every room of The Thirty Club, at any
            hour, for life.
          </p>
          <p className="member-card__small">
            Non-transferable. Not that anyone else asked.
          </p>
          <p className="member-card__signed">The Committee</p>
        </section>
      </div>
      <button
        type="button"
        className="member-card__flip"
        onClick={() => setSide((s) => (s === 'front' ? 'back' : 'front'))}
      >
        {side === 'front' ? 'Turn the card over' : 'Show the front'}
      </button>
    </div>
  );
}
