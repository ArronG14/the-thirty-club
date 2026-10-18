import { nonSpaPath } from '../routing.ts';

// Request routing only: no authentication, member state or application backend.
export default async function spa(
  request: Request,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (
    url.pathname === '/' ||
    nonSpaPath.test(url.pathname) ||
    !['GET', 'HEAD'].includes(request.method) ||
    !request.headers.get('accept')?.includes('text/html')
  ) {
    return;
  }

  // Root navigation bypasses this function, preventing recursion and avoiding
  // Netlify Pretty URLs redirects for /index.html.
  // Forward request headers for conditional requests and protected previews.
  const response = await fetch(new URL('/', url), {
    method: request.method,
    headers: request.headers,
    redirect: 'manual',
  });
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  // HTML navigation and non-HTML fetches have different routing behavior.
  headers.append('Vary', 'Accept');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
