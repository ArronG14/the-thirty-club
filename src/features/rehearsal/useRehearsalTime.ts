import { useEffect, useState } from 'react';
import { CLOCK_EVENT, rehearsalNow } from './clock';

/** The simulated time, ticking; the indicator and the menu use it. */
export function useRehearsalTime(active: boolean) {
  const [now, setNow] = useState(() => rehearsalNow());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(rehearsalNow());
    const timer = setInterval(tick, 1000);
    window.addEventListener(CLOCK_EVENT, tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener(CLOCK_EVENT, tick);
    };
  }, [active]);
  return now;
}
