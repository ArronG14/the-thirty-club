/**
 * The envelope from an opened compartment: the only place a gift location
 * is ever shown, and only because the server returned it for an OPENED
 * compartment. It says where to look, never what is there.
 */
import { useEffect, useRef } from 'react';
import type { MemberVault } from '../../../shared/concierge/types';
import { plate } from '../domain/vaultScript';

export function VaultLetter({
  vault,
  rehearsal,
  reducedMotion,
  onClose,
}: {
  vault: MemberVault;
  rehearsal: boolean;
  reducedMotion: boolean;
  onClose(): void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Let the envelope open before moving focus, so VoiceOver reads the card.
    const timer = setTimeout(
      () => headingRef.current?.focus(),
      reducedMotion ? 0 : 1400,
    );
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose, reducedMotion]);

  const location = vault.giftLocation?.trim();
  return (
    <div
      className="vault-letter"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vault-letter-title"
    >
      <div className="vault-letter__envelope" aria-hidden="true">
        <span className="vault-letter__flap" />
        <span className="vault-letter__seal">30</span>
      </div>
      <article className="vault-letter__card">
        <p className="vault-letter__eyebrow">
          Private deposit · No. {plate(vault.number)}
        </p>
        <h2 id="vault-letter-title" ref={headingRef} tabIndex={-1}>
          A gift awaits you, Madam.
        </h2>
        <p className="vault-letter__lead">
          Your surprise has been carefully prepared. You will find it:
        </p>
        {location ? (
          <p className="vault-letter__location">{location}</p>
        ) : (
          <p className="vault-letter__location vault-letter__location--pending">
            {rehearsal
              ? 'No location has been written for this compartment yet.'
              : 'Your Butler is still writing these directions. Do look in again shortly.'}
          </p>
        )}
        <p className="vault-letter__sign">
          With the compliments of The Thirty Club.
        </p>
        <button
          ref={closeRef}
          type="button"
          className="vault-button vault-button--quiet"
          onClick={onClose}
        >
          Return to the vault
        </button>
      </article>
    </div>
  );
}
