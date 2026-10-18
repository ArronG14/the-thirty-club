import { stampDate, boardTime, UK_ZONE } from '../domain/time';
import { Emblem, InkStamp } from './Artwork';

/** Deterministic bars for the decorative barcode. */
const BARS = Array.from(
  { length: 16 },
  (_, i) => 1 + ((i * 7 + (i % 5) * 3) % 3),
);

/**
 * Alise's boarding pass: ivory card, perforated stub, the concierge's
 * CLEARED stamp once her credential has been recognised.
 */
export function BoardingPass({
  departureAt,
  cleared,
  stampIn = false,
}: {
  departureAt: number;
  cleared: boolean;
  /** Animate the stamp landing (the boarding ceremony). */
  stampIn?: boolean;
}) {
  const date = stampDate(departureAt, UK_ZONE);
  const boarding = boardTime(departureAt, UK_ZONE).split(' ')[1] ?? '';
  return (
    <article className="pass paper" aria-label="Boarding pass">
      <div className="pass__main">
        <header className="pass__head">
          <Emblem />
          <p className="pass__house">
            The Thirty Club
            <span>Boarding pass · Private</span>
          </p>
        </header>
        <p className="pass__route">
          <span className="pass__place">
            <small>From</small>
            <span className="pass__city">London</span>
          </span>
          <span className="pass__arc" aria-hidden="true">
            <svg viewBox="0 0 80 24">
              <path d="M2,20 Q40,-6 78,20" fill="none" strokeDasharray="2 3" />
              <path d="M36,6.5 l8,-1.5 l-3,3.5 z" className="pass__plane" />
            </svg>
          </span>
          <span className="pass__place">
            <small>To</small>
            <span className="pass__city">Jamaica</span>
          </span>
        </p>
        <dl className="pass__grid">
          <div className="pass__field pass__field--wide">
            <dt>Passenger</dt>
            <dd>Madam Alise Khera</dd>
          </div>
          <div className="pass__field">
            <dt>Flight</dt>
            <dd>TC 030</dd>
          </div>
          <div className="pass__field">
            <dt>Date</dt>
            <dd>{date}</dd>
          </div>
          <div className="pass__field">
            <dt>Seat</dt>
            <dd>30A</dd>
          </div>
          <div className="pass__field">
            <dt>Class</dt>
            <dd>Member</dd>
          </div>
        </dl>
      </div>
      <div className="pass__stub" aria-hidden="true">
        <p>
          Gate<span>Private</span>
        </p>
        <p>
          Boarding<span>{boarding}</span>
        </p>
        <span className="pass__barcode">
          {BARS.map((width, i) => (
            <i key={i} style={{ width: `${width}px` }} />
          ))}
        </span>
      </div>
      {cleared && (
        <div className="pass__stamp" data-animate={stampIn}>
          <InkStamp word="Cleared" date={`${date} MMXXVI`} tone="navy" />
        </div>
      )}
    </article>
  );
}
