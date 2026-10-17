import { useEffect } from 'react';
import { useConnectivityStore } from './connectivityStore';

export function useConnectivity() {
  const setOnline = useConnectivityStore((state) => state.setOnline);
  useEffect(() => {
    const online = () => setOnline(true);
    const offline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [setOnline]);
}
