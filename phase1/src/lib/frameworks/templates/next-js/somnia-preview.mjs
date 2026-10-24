// Dev-only gate for the Somnia loopback preview. It does nothing unless Somnia starts the dev server with a
// preview token, so the same project still runs with a plain `next dev`, `next build` and `node server.js`.
// Used by proxy.ts / proxy.js. Somnia owns this file: it is replaced when the project is updated.
const TOKEN = /^[a-f0-9]{32,128}$/;

export function previewPolicy(port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port');
  return `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:${port}; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'; frame-ancestors 'none'`;
}

/**
 * @param {Request & {nextUrl?: URL}} request
 * @returns {Response | null} A response to send instead of the page, or null to let the request through.
 */
export function somniaPreviewGate(request, env = process.env) {
  const token = env.SOMNIA_PREVIEW_TOKEN;
  if (!token) return null;
  if (!TOKEN.test(token)) throw new Error('Invalid Somnia preview configuration');
  const port = Number(env.SOMNIA_PREVIEW_PORT);
  const policy = previewPolicy(port);
  const cookieName = `somnia_preview_${port}`;
  const deny = () => new Response('Forbidden', { status: 403 });
  const url = new URL(request.url);
  if (request.headers.get('host') !== `127.0.0.1:${port}`) return deny();
  const hasCookie = String(request.headers.get('cookie') ?? '').split(';').some((part) => part.trim() === `${cookieName}=${token}`);
  if (url.pathname === '/__somnia/source-events') {
    if (request.method === 'GET' && request.headers.get('authorization') === `Bearer ${token}`) {
      return new Response(JSON.stringify({ events: [] }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    return deny();
  }
  if (url.searchParams.get('somnia-preview-token') === token) {
    url.searchParams.delete('somnia-preview-token');
    return new Response(null, {
      status: 307,
      headers: { Location: url.origin + url.pathname + url.search, 'Set-Cookie': `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/`, 'Cache-Control': 'no-store' },
    });
  }
  if (!hasCookie) return deny();
  return null;
}

/** Headers to add to every allowed response while the preview token is set. */
export function somniaPreviewHeaders(env = process.env) {
  if (!env.SOMNIA_PREVIEW_TOKEN) return {};
  return { 'Content-Security-Policy': previewPolicy(Number(env.SOMNIA_PREVIEW_PORT)), 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };
}
