/**
 * Which newly prepared compartments the Butler has already announced on
 * this device, so he does not repeat himself. Non-authoritative: losing it
 * only means he announces once more.
 */
const KEY = 'thirty-club:vault-announced';

function read(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

export function wasAnnounced(id: string): boolean {
  return read().includes(id);
}

export function markAnnounced(id: string) {
  try {
    const list = read();
    if (!list.includes(id))
      localStorage.setItem(KEY, JSON.stringify([...list, id].slice(-100)));
  } catch {
    // Storage unavailable: he may announce again. Harmless.
  }
}
