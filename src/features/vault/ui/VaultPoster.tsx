/**
 * The CSS chamber: the instant poster while the 3D vault loads, and the
 * complete fallback when WebGL is unavailable or too slow. A curved bank of
 * brass-framed boxes in perspective; Alise's compartments sit at eye level
 * and open with the same states and the same (simpler) ceremony.
 */
import type { CSSProperties } from 'react';
import type { MemberVault } from '../../../shared/concierge/types';
import { plate } from '../domain/vaultScript';

export function VaultPoster({
  vaults,
  open,
  focus,
  sealed,
  opening,
  hidden,
  onSelect,
}: {
  vaults: readonly MemberVault[];
  open: boolean;
  focus: string | null;
  sealed: string | null;
  opening: string | null;
  hidden: boolean;
  onSelect(id: string): void;
}) {
  const n = vaults.length;
  return (
    <div
      className="vault-poster"
      data-hidden={hidden ? 'true' : 'false'}
      data-focus={focus ? 'true' : 'false'}
    >
      <div className="vault-poster__oculus" aria-hidden="true" />
      <div className="vault-poster__bank" aria-hidden="true">
        {vaults.map((v, i) => {
          let state = open ? v.state : 'locked';
          if (sealed === v.id) state = 'ready';
          const style = {
            '--angle': `${((n - 1) / 2 - i) * Math.min(14, 48 / Math.max(1, n))}deg`,
          } as CSSProperties;
          return (
            <button
              key={v.id}
              type="button"
              tabIndex={-1}
              className="vault-box"
              data-state={state}
              data-focus={focus === v.id ? 'true' : 'false'}
              data-opening={opening === v.id ? 'true' : 'false'}
              style={style}
              onClick={() => onSelect(v.id)}
            >
              <span className="vault-box__interior">
                <span className="vault-box__envelope" />
              </span>
              <span className="vault-box__door">
                <span className="vault-box__plate">No. {plate(v.number)}</span>
                <span className="vault-box__dial" />
              </span>
            </button>
          );
        })}
      </div>
      <div className="vault-poster__floor" aria-hidden="true" />
    </div>
  );
}
