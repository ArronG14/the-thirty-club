import ScreeningRoom, { ArrivalFrame, EndFrame } from '../ui/ScreeningRoom';
import type { VideoMessage } from '../domain/videoMessages';

/** Development-only technical fixtures, never birthday content or production imports. */
const fixtures: readonly VideoMessage[] = [
  {
    id: 'test-landscape',
    sender: 'Landscape test film',
    order: 1,
    video: { src: '/media/screening/test-landscape.mp4', type: 'video/mp4' },
    transcript:
      'Technical test: moving colour bars with a soft tone. Not a birthday message.',
  },
  {
    id: 'test-portrait',
    sender: 'Portrait test film',
    order: 2,
    video: { src: '/media/screening/test-portrait.mp4', type: 'video/mp4' },
    transcript: 'Technical portrait test. Not a birthday message.',
  },
];
export default function ScreeningPreview({ mode }: { mode: string }) {
  if (mode === 'screening-arrival') return <ArrivalFrame />;
  if (mode === 'screening-endframe') return <EndFrame />;
  return <ScreeningRoom messages={mode === 'screening-demo' ? fixtures : []} />;
}
