import { create } from 'zustand';

type ConnectivityState = {
  isOnline: boolean;
  setOnline: (isOnline: boolean) => void;
};

// A browser hint only. Future API requests must handle their own failures.
export const useConnectivityStore = create<ConnectivityState>((set) => ({
  isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
  setOnline: (isOnline) => set({ isOnline }),
}));
