// Same-origin Git smart HTTP relay. Never act as a general-purpose URL proxy.
export async function onRequest({ request }, upstreamFetch = fetch) {
  const incoming = new URL(request.url);
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if ((origin && origin !== incoming.origin) || (site && !['same-origin', 'none'].includes(site))) {
    return new Response('Cross-origin requests are not allowed.', { status: 403 });
  }
  const match = incoming.pathname.match(/^\/api\/git\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+\.git)\/(info\/refs|git-receive-pack)$/);
  if (!match || ['.', '..'].includes(match[1]) || ['.git', '..git', '...git'].includes(match[2])) return new Response('Unsupported Git endpoint.', { status: 404 });
  const discovery = request.method === 'GET' && match[3] === 'info/refs' && incoming.search === '?service=git-receive-pack';
  const receive = request.method === 'POST' && match[3] === 'git-receive-pack' && !incoming.search;
  if (!discovery && !receive) return new Response('Unsupported Git operation.', { status: 405 });
  if (receive && request.headers.get('content-type') !== 'application/x-git-receive-pack-request') return new Response('Invalid Git content type.', { status: 415 });
  const headers = new Headers();
  for (const name of ['authorization', 'accept', 'content-type', 'git-protocol']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const upstream = await upstreamFetch(`https://github.com/${match[1]}/${match[2]}/${match[3]}${incoming.search}`, {
      method: request.method, headers, redirect: 'manual', ...(receive ? { body: request.body, duplex: 'half' } : {})
    });
    // Do not follow redirects, especially with an Authorization header.
    if (upstream.status >= 300 && upstream.status < 400) return new Response('GitHub redirected the request. Check the repository URL.', { status: 502 });
    const responseHeaders = new Headers({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    const type = upstream.headers.get('content-type');
    if (type) responseHeaders.set('content-type', type);
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
  } catch {
    return new Response('Could not connect to GitHub.', { status: 502 });
  }
}
