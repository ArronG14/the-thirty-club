import { useSyncExternalStore } from 'react';
import {
  describeDiagnostics,
  entranceDiagnostics,
} from '../scene/entranceDiagnostics';

/** On-screen readout for `?entrance-diag`: names the 3D scene's state. */
export function EntranceDiagBadge() {
  const state = useSyncExternalStore(
    entranceDiagnostics.subscribe,
    entranceDiagnostics.get,
  );
  return (
    <p
      role="status"
      style={{
        position: 'fixed',
        left: 4,
        right: 4,
        bottom: 'max(4px, env(safe-area-inset-bottom))',
        zIndex: 900,
        margin: 0,
        padding: '4px 6px',
        font: '10px/1.3 ui-monospace, Menlo, monospace',
        color: '#e9d39b',
        background: 'rgb(0 0 0 / 0.78)',
        pointerEvents: 'none',
      }}
    >
      {describeDiagnostics(state)}
    </p>
  );
}
