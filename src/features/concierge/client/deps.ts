import type { ConciergeDeps } from '../useConcierge';
import { httpConciergeApi } from './api';
import { browserConciergeStorage } from './localRecord';
import { activeSession, clearSession, saveSession } from './sessionStore';

/** The real service, this device's record and its session. */
export function browserConciergeDeps(): ConciergeDeps {
  return {
    api: httpConciergeApi,
    storage: browserConciergeStorage(),
    sessions: {
      active: () => activeSession(),
      save: (token) => saveSession(token),
      clear: (realm) => clearSession(realm),
    },
  };
}
