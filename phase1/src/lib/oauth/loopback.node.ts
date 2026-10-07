/**
 * Node implementation of LoopbackReceiver (node:http). Used by tests, the CLI scripts and any Node sidecar.
 * NOT importable from the webview bundle: in the Tauri app the native host implements LoopbackReceiver
 * (see docs/oauth/OAUTH-CLIENT.md). Binds 127.0.0.1 only.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { OAuthError } from './errors';
import type { LoopbackReceiver } from './types';

export interface NodeLoopbackOptions {
  /** 0 = ephemeral. Some providers pre-register a fixed port. Default 0. */
  port?: number;
  /** Default /callback. */
  path?: string;
  successHtml?: string;
  failureHtml?: string;
}

const page = (title: string, body: string) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px system-ui;margin:4rem auto;max-width:28rem"><h1>${title}</h1><p>${body}</p>`;

export async function startNodeLoopback(options: NodeLoopbackOptions = {}): Promise<LoopbackReceiver> {
  const path = options.path ?? '/callback';
  if (!path.startsWith('/')) throw new OAuthError('invalid-config', 'Loopback path must start with "/".');
  let settle: { resolve: (v: string) => void; reject: (e: unknown) => void } | undefined;
  let result: { ok: true; value: string } | { ok: false; error: unknown } | undefined;
  const deliver = (r: NonNullable<typeof result>) => {
    if (result) return;
    result = r;
    if (settle) r.ok ? settle.resolve(r.value) : settle.reject(r.error);
  };

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const hostOk = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host ?? '');
    if (req.method !== 'GET' || url.pathname !== path || !hostOk) { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); return; }
    if (result) { res.writeHead(409, { 'content-type': 'text/plain' }).end('Already handled'); return; }
    const failed = url.searchParams.has('error') || !url.searchParams.has('code');
    res.writeHead(failed ? 400 : 200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
    res.end(failed ? (options.failureHtml ?? page('Sign-in failed', 'You can close this tab and return to Somnia.')) : (options.successHtml ?? page('Signed in', 'You can close this tab and return to Somnia.')));
    deliver({ ok: true, value: url.pathname + url.search });
  });
  server.on('clientError', (_e, socket) => socket.destroy());

  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(options.port ?? 0, '127.0.0.1', () => { server.off('error', reject); resolve(); }); })
    .catch((cause) => { throw new OAuthError('network', 'Loopback port is not available.', { cause }); });
  const port = (server.address() as AddressInfo).port;
  let closed = false;

  return {
    redirectUri: `http://127.0.0.1:${port}${path}`,
    waitForCallback(signal) {
      return new Promise<string>((resolve, reject) => {
        if (result) { result.ok ? resolve(result.value) : reject(result.error); return; }
        settle = { resolve, reject };
        if (signal) {
          const onAbort = () => deliver({ ok: false, error: signal.reason instanceof OAuthError ? signal.reason : new OAuthError('cancelled', 'Cancelled.') });
          if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true });
        }
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      deliver({ ok: false, error: new OAuthError('cancelled', 'Receiver closed.') });
      server.closeAllConnections?.();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
