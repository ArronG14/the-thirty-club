import { beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.resetModules();
});

it('requires five taps within a rolling three second window', async () => {
  const { fiveTapGesture } = await import('./session');
  const open = vi.fn();
  const tap = fiveTapGesture(open);
  [0, 1000, 2000, 3001, 4002].forEach(tap);
  expect(open).not.toHaveBeenCalled();
  [4100, 4200, 4300].forEach(tap);
  expect(open).toHaveBeenCalledTimes(1);
  tap(4400);
  expect(open).toHaveBeenCalledTimes(1);
});

it('rejects incorrect PINs and fails closed if session storage is unavailable', async () => {
  const { authenticateOwner } = await import('./session');
  expect(authenticateOwner('0000')).toBe(false);
  expect(sessionStorage.length).toBe(0);
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw Error('blocked');
  });
  expect(authenticateOwner('1414')).toBe(false);
  spy.mockRestore();
});

it('isolates all records, reset and late cleanup writes from guest storage', async () => {
  let session = await import('./session');
  expect(session.authenticateOwner('1414')).toBe(true);
  vi.resetModules();
  session = await import('./session');
  expect(session.ownerActive).toBe(true);
  const keys = ['entrance', 'membership', 'screening', 'casino', 'prizes'];
  for (const key of keys) {
    localStorage.setItem(`thirty-club:${key}`, 'guest');
    session.progressStorage.setItem(`thirty-club:${key}`, 'test');
    expect(session.progressStorage.getItem(`thirty-club:${key}`)).toBe('test');
  }
  session.exitOwner();
  session.progressStorage.setItem('thirty-club:prizes', 'late owner write');
  expect(
    sessionStorage.getItem(session.OWNER_PREFIX + 'thirty-club:prizes'),
  ).toBeNull();
  for (const key of keys)
    expect(localStorage.getItem(`thirty-club:${key}`)).toBe('guest');
  vi.resetModules();
  session = await import('./session');
  expect(session.ownerActive).toBe(false);
  expect(session.progressStorage.getItem('thirty-club:prizes')).toBe('guest');
});

it('loses authentication in a new browser session', async () => {
  const { authenticateOwner } = await import('./session');
  authenticateOwner('1414');
  sessionStorage.clear();
  vi.resetModules();
  expect((await import('./session')).ownerActive).toBe(false);
});
