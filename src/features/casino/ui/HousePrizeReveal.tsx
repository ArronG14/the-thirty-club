import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { claimDrinks } from '../../drinks/drinksApi';
import { FilmPlayer } from '../../../shared/media/FilmPlayer';
import type { HouseSpin } from '../useHouseSpins';
import './housePrize.css';

const safeMedia = (url: string | null | undefined): url is string =>
  !!url && (url.startsWith('/') || url.startsWith('https://'));

/**
 * A prize the server has awarded (ADR-024): shown after the reels settle,
 * or again when she returns with it unclaimed. Drinks are credited only by
 * her CLAIM; a film plays on her tap (iPhone opens its own player); the
 * jackpot prepares a Gift Vault compartment whose key she must find.
 */
export function HousePrizeReveal({
  spin,
  claimed,
  onClaimed,
  onClose,
}: {
  spin: HouseSpin & { prize: NonNullable<HouseSpin['prize']> };
  /** True when the drinks were already claimed (from the server). */
  claimed: boolean;
  onClaimed(): void;
  onClose(): void;
}) {
  const { prize } = spin;
  const titleId = useId();
  const close = useRef<HTMLButtonElement>(null);
  const [claim, setClaim] = useState<'idle' | 'busy' | 'done' | 'error'>(
    claimed ? 'done' : 'idle',
  );
  const [message, setMessage] = useState('');
  const drinks = prize.drinksKind && prize.drinksQuantity;
  const film = safeMedia(prize.videoUrl) ? prize.videoUrl : null;
  const jackpot = prize.kind === 'VAULT_GIFT';

  useEffect(() => {
    close.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const doClaim = async () => {
    if (!spin.entitlementId || claim === 'busy') return;
    setClaim('busy');
    setMessage('');
    const result = await claimDrinks(spin.entitlementId);
    if (result.ok) {
      setClaim('done');
      onClaimed();
    } else {
      setClaim('error');
      setMessage(result.message);
    }
  };

  return (
    <div className="house-prize" role="presentation">
      <div
        className="house-prize__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-jackpot={jackpot ? 'true' : 'false'}
      >
        <p className="house-prize__eyebrow">
          {jackpot
            ? 'The jackpot'
            : film
              ? 'A private screening'
              : 'Fortune favours you'}
        </p>
        <h2 id={titleId}>{prize.title}</h2>
        {safeMedia(prize.imageUrl) && (
          <img className="house-prize__art" src={prize.imageUrl} alt="" />
        )}
        <p className="house-prize__words">
          {prize.presentation || prize.description}
        </p>

        {drinks && (
          <div className="house-prize__action">
            {claim === 'done' ? (
              <>
                <p role="status">
                  {prize.drinksQuantity} drinks are yours, Madam. Whenever you
                  wish, simply name one.
                </p>
                <Link className="house-prize__button" to="/drinks">
                  Bring me a drink
                </Link>
              </>
            ) : (
              <button
                type="button"
                className="house-prize__button"
                disabled={claim === 'busy'}
                onClick={() => void doClaim()}
              >
                {claim === 'busy'
                  ? 'One moment…'
                  : `Claim your ${prize.drinksQuantity} drinks`}
              </button>
            )}
            {claim !== 'done' && (
              <p className="house-prize__fine">
                Unclaimed prizes wait for you, here and under Drinks in the
                Lounge.
              </p>
            )}
            {message && <p role="alert">{message}</p>}
          </div>
        )}

        {film && (
          <div className="house-prize__film">
            {/* Not playsInline: on iPhone, play() inside the tap opens the
                native fullscreen player (ADR-019). A protected film's
                ticket is fetched before her tap (ADR-026). */}
            <FilmPlayer
              src={film}
              title={prize.title}
              buttonClassName="house-prize__button"
              noteClassName="house-prize__fine"
            />
            <p className="house-prize__fine">
              Kept in your Casino vouchers in the Lounge, to watch again.
            </p>
          </div>
        )}

        {jackpot && (
          <p className="house-prize__fine">
            A compartment in the Gift Vault has been prepared in your name. Its
            key is somewhere close at hand; when you find it, hold your
            telephone to it.
          </p>
        )}

        {!drinks && !film && !jackpot && (
          <p className="house-prize__fine">
            Kept in your Casino vouchers, in the Members’ Lounge.
          </p>
        )}

        <button
          ref={close}
          type="button"
          className="house-prize__close"
          onClick={onClose}
        >
          Return to the table
        </button>
      </div>
    </div>
  );
}
