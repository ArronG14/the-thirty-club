/**
 * Why the entrance is (or is not) in 3D. Free of three.js. The latest state
 * is always on `window.__entranceDiag` and in sessionStorage, and `?entrance-diag`
 * shows it on screen, so a failure on the real iPhone names its own cause.
 * Nothing leaves the device; nothing personal is recorded.
 */
export type FallbackReason =
  'performance' | 'context-lost' | 'error' | 'webgl-unavailable';

export interface EntranceDiagnostics {
  state: 'initialising' | 'running' | 'fallback';
  reason?: FallbackReason | undefined;
  /** Human-readable cause, e.g. the thrown error's message. */
  message?: string | undefined;
  tier?: number | undefined;
  meanFrameMs?: number | undefined;
  msSinceReady?: number | undefined;
  contextLosses: number;
  hidden: boolean;
  dpr: number;
  viewport: string;
  canvas?: string | undefined;
  at: string;
}

export const DIAG_PARAM = 'entrance-diag';
export const DIAG_STORAGE_KEY = 'thirty-club:entrance-diag';

let current: EntranceDiagnostics = snapshot({ state: 'initialising' });
const listeners = new Set<() => void>();

function snapshot(
  patch: Partial<EntranceDiagnostics> & Pick<EntranceDiagnostics, 'state'>,
): EntranceDiagnostics {
  const inWindow = typeof window !== 'undefined';
  return {
    contextLosses: 0,
    hidden: inWindow ? document.visibilityState === 'hidden' : false,
    dpr: inWindow ? window.devicePixelRatio : 1,
    viewport: inWindow ? `${window.innerWidth}x${window.innerHeight}` : '',
    at: new Date().toISOString(),
    ...patch,
  };
}

export function noteEntrance(
  patch: Partial<EntranceDiagnostics> & Pick<EntranceDiagnostics, 'state'>,
): void {
  current = snapshot({
    contextLosses: current.contextLosses,
    tier: current.tier,
    ...patch,
  });
  if (import.meta.env.DEV && current.state === 'fallback')
    console.warn('[entrance] 3D scene fell back:', current);
  try {
    (window as unknown as { __entranceDiag?: unknown }).__entranceDiag =
      current;
    sessionStorage.setItem(DIAG_STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* diagnostics are best effort */
  }
  listeners.forEach((listener) => listener());
}

export const entranceDiagnostics = {
  get: () => current,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function diagnosticsRequested(): boolean {
  try {
    return new URLSearchParams(window.location.search).has(DIAG_PARAM);
  } catch {
    return false;
  }
}

export function describeDiagnostics(d: EntranceDiagnostics): string {
  const parts: string[] = [`3D ${d.state}`];
  if (d.reason) parts.push(d.reason);
  if (d.message) parts.push(d.message);
  if (d.tier !== undefined) parts.push(`tier ${d.tier}`);
  if (d.meanFrameMs !== undefined)
    parts.push(`${d.meanFrameMs.toFixed(1)} ms/frame`);
  if (d.msSinceReady !== undefined)
    parts.push(`${(d.msSinceReady / 1000).toFixed(1)} s after first frame`);
  if (d.contextLosses) parts.push(`context losses ${d.contextLosses}`);
  parts.push(`dpr ${d.dpr}`, d.viewport);
  if (d.canvas) parts.push(`canvas ${d.canvas}`);
  if (d.hidden) parts.push('page hidden');
  return parts.join(' · ');
}
