import { TEST_FILM } from '../config/screeningFilm';
import ScreeningRoom, { ArrivalFrame, EndFrame } from '../ui/ScreeningRoom';

/**
 * Development-only views of the room, independent of the membership:
 * `screening-demo` seats her with the five-second test film,
 * `screening` shows LIVE before the birthday film is configured.
 */
export default function ScreeningPreview({ mode }: { mode: string }) {
  if (mode === 'screening-arrival') return <ArrivalFrame />;
  if (mode === 'screening-endframe') return <EndFrame />;
  return <ScreeningRoom film={mode === 'screening-demo' ? TEST_FILM : null} />;
}
