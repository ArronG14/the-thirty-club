/**
 * REHEARSAL ONLY. Routes a rehearsal document's `/api/` calls to the
 * simulated office in this tab (ADR-018). Installed from `main.tsx` before
 * the application renders, and only in a rehearsal document.
 *
 * Fail-closed rules:
 * - Same-origin `/api/` requests are answered by the simulation; if it is
 *   not ready they fail, they never fall through to the real server.
 * - Requests to messaging and database providers are refused outright.
 * - If the page has (somehow) navigated in-app to a LIVE owner path, every
 *   API call is refused until the document reloads into the LIVE world.
 */
import { ownerActive } from '../../owner/session';
import { isLiveOwnerPath, simulatedOwnerDocument } from '../mode';

const BLOCKED_HOSTS =
  /(^|\.)(twilio\.com|telegram\.org|supabase\.co|supabase\.com)$/i;

function refusal(status: number, message: string) {
  return new Response(
    JSON.stringify({ error: 'forbidden', message, simulated: true }),
    {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-thirty-simulation': 'refused',
      },
    },
  );
}

export function installRehearsalFetch() {
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (BLOCKED_HOSTS.test(url.hostname))
      return refusal(403, 'Rehearsal never contacts external providers.');
    if (
      url.origin !== window.location.origin ||
      !url.pathname.startsWith('/api/')
    )
      return real(input, init);
    if (isLiveOwnerPath(window.location.pathname))
      return refusal(
        409,
        'This page changed between LIVE and TEST. Reload before continuing.',
      );
    if (!ownerActive)
      return refusal(401, 'Enter Dev Mode (the PIN) to use the rehearsal.');
    try {
      if (url.pathname.startsWith('/api/v1/')) {
        // A launch's state (admissions, milestones, spins) is in place
        // before this page's first answer, so no request sees it half-made.
        await (await import('../office')).applyLaunchIntents();
        const { simOffice } = await import('./v1');
        const office = await simOffice();
        return await office.handle(
          request,
          simulatedOwnerDocument ? 'owner' : 'member',
        );
      }
      const { simConcierge } = await import('./legacy');
      return await simConcierge()(request, 'rehearsal');
    } catch (error) {
      console.error('[rehearsal] simulated office failed', error);
      return new Response(
        JSON.stringify({
          error: 'server',
          message:
            'The simulated club office could not start on this device. Nothing real was contacted.',
          simulated: true,
        }),
        { status: 503, headers: { 'content-type': 'application/json' } },
      );
    }
  };
}
