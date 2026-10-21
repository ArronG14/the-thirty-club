import { useEffect, useState } from 'react';
import { establishStanding } from '../vault/client/vaultApi';
import { loadDrinks } from './drinksApi';

/**
 * Whether the Lounge should offer Drinks: once any drink has been placed at
 * her disposal, or a prize granting drinks awaits her claim. Quiet on
 * failure (the dock simply does not show it).
 */
export function useDrinksPresence(): { show: boolean; waiting: number } {
  const [state, setState] = useState({ show: false, waiting: 0 });
  useEffect(() => {
    let active = true;
    const check = async () => {
      const standing = await establishStanding();
      if (!active || standing.kind !== 'member') return;
      const result = await loadDrinks();
      if (!active || !result.ok) return;
      const { airport, jamaica, unclaimed } = result.data;
      setState({
        show: airport.granted + jamaica.granted > 0 || unclaimed.length > 0,
        waiting: unclaimed.length,
      });
    };
    void check();
    const again = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const timer = setInterval(again, 60_000);
    document.addEventListener('visibilitychange', again);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', again);
    };
  }, []);
  return state;
}
