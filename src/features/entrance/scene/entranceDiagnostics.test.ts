import { describe, expect, it } from 'vitest';
import {
  describeDiagnostics,
  entranceDiagnostics,
  noteEntrance,
} from './entranceDiagnostics';

describe('entrance diagnostics', () => {
  it('names the fallback reason and the state around it', () => {
    noteEntrance({
      state: 'fallback',
      reason: 'context-lost',
      message: 'context not restored',
      tier: 2,
      meanFrameMs: 33.3,
      msSinceReady: 7_500,
    });
    const text = describeDiagnostics(entranceDiagnostics.get());
    expect(text).toContain('3D fallback');
    expect(text).toContain('context-lost');
    expect(text).toContain('tier 2');
    expect(text).toContain('33.3 ms/frame');
    expect(text).toContain('7.5 s after first frame');
  });

  it('keeps the tier and context-loss count across updates', () => {
    noteEntrance({ state: 'running', tier: 1, contextLosses: 2 });
    noteEntrance({ state: 'running', message: 'context restored' });
    expect(entranceDiagnostics.get()).toMatchObject({
      tier: 1,
      contextLosses: 2,
    });
  });

  it('notifies subscribers', () => {
    let calls = 0;
    const off = entranceDiagnostics.subscribe(() => (calls += 1));
    noteEntrance({ state: 'running' });
    off();
    noteEntrance({ state: 'running' });
    expect(calls).toBe(1);
  });
});
