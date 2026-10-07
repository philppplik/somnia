import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { generateKeyPairSync, createSign, sign as nodeSign, constants, type KeyObject } from 'node:crypto';
import { createOAuthClient, OAuthError, parseCallback, codeChallengeS256, createCodeVerifier, base64Url, fetchDiscovery, configFromDiscovery, verifyIdToken, createTokenManager, type OAuthTokenSet, type TokenStore, type Jwk } from './index';
import { startNodeLoopback } from './loopback.node';

// ---- mock authorization server ---------------------------------------------------------------
interface Hit { path: string; body: URLSearchParams; auth?: string }
async function readBody(req: IncomingMessage) { let s = ''; for await (const c of req) s += c; return s; }
async function mockServer(handler: (hit: Hit, n: number) => { status?: number; json?: unknown; text?: string; delayMs?: number }) {
  const hits: Hit[] = [];
  const server: Server = createServer(async (req, res) => {
    const raw = await readBody(req);
    const hit: Hit = { path: req.url ?? '', body: new URLSearchParams(raw), auth: req.headers.authorization };
    hits.push(hit);
    if (req.url === '/.well-known/openid-configuration') { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(discoveryDoc(base()))); return; }
    const r = handler(hit, hits.length);
    if (r.delayMs) await new Promise((x) => setTimeout(x, r.delayMs));
    res.writeHead(r.status ?? 200, { 'content-type': 'application/json' }).end(r.text ?? JSON.stringify(r.json ?? {}));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const discoveryDoc = (b: string) => ({ issuer: b, authorization_endpoint: `${b}/authorize`, token_endpoint: `${b}/token`, revocation_endpoint: `${b}/revoke`, jwks_uri: `${b}/jwks` });
  return { hits, base, close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }) };
}
const cfg = (b: string, extra = {}) => ({ clientId: 'cid', authorizeEndpoint: `${b}/authorize`, tokenEndpoint: `${b}/token`, scopes: ['openid', 'offline_access'], ...extra });
const REDIRECT = 'http://127.0.0.1:1455/auth/callback';
const q = (u: string) => new URL(u).searchParams;

// ---- PKCE ------------------------------------------------------------------------------------
test('PKCE S256 matches the RFC 7636 appendix B vector', async () => {
  assert.equal(await codeChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});
test('verifier is 43+ chars, unique, urlsafe; short verifiers rejected', async () => {
  const a = createCodeVerifier(), b = createCodeVerifier();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/); assert.notEqual(a, b);
  assert.throws(() => createCodeVerifier(undefined, 16), RangeError);
  await assert.rejects(codeChallengeS256('short'), RangeError);
  assert.equal(base64Url(new Uint8Array([251, 255, 254])), '-__-');
});

// ---- authorize URL ---------------------------------------------------------------------------
test('authorize URL carries all protocol params and extras, state/nonce unique', async () => {
  const c = createOAuthClient(cfg('https://auth.example', { useNonce: true, extraAuthorizeParams: { resource: 'https://api.example/v1', ext_agent_host_id: 'urn:uuid:1', agent_name_hint: 'Somnia' } }));
  const s1 = await c.beginAuthorization(REDIRECT), s2 = await c.beginAuthorization(REDIRECT);
  const p = q(s1.url);
  assert.equal(p.get('response_type'), 'code'); assert.equal(p.get('client_id'), 'cid'); assert.equal(p.get('redirect_uri'), REDIRECT);
  assert.equal(p.get('scope'), 'openid offline_access'); assert.equal(p.get('code_challenge_method'), 'S256');
  assert.equal(p.get('code_challenge'), await codeChallengeS256(s1.codeVerifier));
  assert.equal(p.get('state'), s1.state); assert.equal(p.get('nonce'), s1.nonce);
  assert.equal(p.get('resource'), 'https://api.example/v1'); assert.equal(p.get('ext_agent_host_id'), 'urn:uuid:1'); assert.equal(p.get('agent_name_hint'), 'Somnia');
  assert.notEqual(s1.state, s2.state); assert.notEqual(s1.nonce, s2.nonce);
  assert.ok(!s1.url.includes(s1.codeVerifier));
});
test('config validation: https, loopback redirect, reserved params, scopes', async () => {
  assert.throws(() => createOAuthClient(cfg('http://evil.example')), (e: OAuthError) => e.code === 'insecure-endpoint');
  assert.doesNotThrow(() => createOAuthClient(cfg('http://127.0.0.1:9')));
  assert.throws(() => createOAuthClient({ ...cfg('https://a.example'), clientId: ' ' }), (e: OAuthError) => e.code === 'invalid-config');
  assert.throws(() => createOAuthClient(cfg('https://a.example', { extraAuthorizeParams: { state: 'x' } })), (e: OAuthError) => e.code === 'invalid-config');
  assert.throws(() => createOAuthClient({ ...cfg('https://a.example'), scopes: ['a b'] }), (e: OAuthError) => e.code === 'invalid-config');
  const c = createOAuthClient(cfg('https://a.example'));
  await assert.rejects(c.beginAuthorization('https://app.example/cb'), (e: OAuthError) => e.code === 'invalid-config');
  await assert.rejects(c.beginAuthorization(REDIRECT, { code_challenge: 'x' }), (e: OAuthError) => e.code === 'invalid-config');
});

// ---- callback parsing ------------------------------------------------------------------------
test('callback: ok, state mismatch, access_denied, provider error, missing code, issuer', () => {
  assert.deepEqual({ ...parseCallback('/auth/callback?code=abc&state=S', 'S') }, { code: 'abc', state: 'S', iss: undefined, clientId: undefined });
  assert.equal(parseCallback('?code=a&state=S&client_id=oaiapp_1', 'S').clientId, 'oaiapp_1');
  const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as OAuthError).code; } };
  assert.equal(code(() => parseCallback('/cb?code=abc&state=X', 'S')), 'state-mismatch');
  assert.equal(code(() => parseCallback('/cb?code=abc', 'S')), 'state-mismatch');
  assert.equal(code(() => parseCallback('/cb?error=access_denied&state=S', 'S')), 'access-denied');
  assert.equal(code(() => parseCallback('/cb?error=server_error&error_description=boom&state=S', 'S')), 'authorization-error');
  assert.equal(code(() => parseCallback('/cb?error=access_denied&state=WRONG', 'S')), 'state-mismatch'); // forged error cannot end a flow
  assert.equal(code(() => parseCallback('/cb?state=S', 'S')), 'protocol');
  assert.equal(code(() => parseCallback('/cb?code=a&state=S&iss=https://evil', 'S', 'https://good')), 'issuer-mismatch');
  assert.equal(code(() => parseCallback('/cb?code=a&state=S&iss=https://good', 'S', 'https://good')), undefined);
});

// ---- token exchange / refresh ----------------------------------------------------------------
test('code exchange sends verifier, redirect, form body; parses tokens', async () => {
  const srv = await mockServer(() => ({ json: { access_token: 'AT', refresh_token: 'RT', token_type: 'Bearer', expires_in: 3600, scope: 'openid offline_access', foo: 1 } }));
  try {
    const now = 1_000_000;
    const c = createOAuthClient(cfg(srv.base(), { extraTokenParams: { resource: 'r' } }), { now: () => now });
    const s = await c.beginAuthorization(REDIRECT);
    const t = await c.completeAuthorization(s, `/auth/callback?code=THECODE&state=${s.state}`);
    const b = srv.hits[0].body;
    assert.equal(b.get('grant_type'), 'authorization_code'); assert.equal(b.get('code'), 'THECODE'); assert.equal(b.get('code_verifier'), s.codeVerifier);
    assert.equal(b.get('redirect_uri'), REDIRECT); assert.equal(b.get('client_id'), 'cid'); assert.equal(b.get('resource'), 'r');
    assert.deepEqual({ ...t }, { clientId: 'cid', accessToken: 'AT', tokenType: 'Bearer', refreshToken: 'RT', idToken: undefined, expiresAt: now + 3_600_000, scopes: ['openid', 'offline_access'], extra: { foo: 1 } });
    await assert.rejects(c.completeAuthorization(s, `/x?code=a&state=${s.state}`), (e: OAuthError) => e.code === 'session-used');
    assert.equal(c.isExpired(t), false);
  } finally { await srv.close(); }
});
test('json body format, basic auth, string expires_in, missing scope falls back to requested', async () => {
  const srv = await mockServer(() => ({ json: { access_token: 'AT', expires_in: '60' } }));
  try {
    const c = createOAuthClient(cfg(srv.base(), { tokenRequestFormat: 'json', clientSecret: 's e', clientAuthMethod: 'basic' }), { now: () => 0 });
    const s = await c.beginAuthorization(REDIRECT);
    const t = await c.completeAuthorization(s, `?code=c&state=${s.state}`);
    assert.equal(srv.hits[0].auth, `Basic ${btoa('cid:s%20e')}`);
    assert.equal(t.expiresAt, 60_000); assert.deepEqual(t.scopes, ['openid', 'offline_access']); assert.equal(t.tokenType, 'Bearer');
    assert.equal(c.isExpired(t, 0), false); assert.equal(c.isExpired(t, 61_000), true);
  } finally { await srv.close(); }
});
test('dynamic client id from callback is used for exchange and kept on the token set', async () => {
  const srv = await mockServer(() => ({ json: { access_token: 'AT', refresh_token: 'R2' } }));
  try {
    const c = createOAuthClient(cfg(srv.base(), { clientId: 'dynamic_agent_client', acceptIssuedClientId: true }));
    const s = await c.beginAuthorization(REDIRECT);
    assert.equal(q(s.url).get('client_id'), 'dynamic_agent_client');
    const t = await c.completeAuthorization(s, `/cb?code=c&state=${s.state}&client_id=oaiapp_123`);
    assert.equal(srv.hits[0].body.get('client_id'), 'oaiapp_123'); assert.equal(t.clientId, 'oaiapp_123');
    await c.refresh(t);
    assert.equal(srv.hits[1].body.get('client_id'), 'oaiapp_123');
    // without the flag the callback client_id is ignored
    const c2 = createOAuthClient(cfg(srv.base()));
    const s2 = await c2.beginAuthorization(REDIRECT);
    assert.equal((await c2.completeAuthorization(s2, `/cb?code=c&state=${s2.state}&client_id=evil`)).clientId, 'cid');
  } finally { await srv.close(); }
});
test('requiredScopes enforced only on an explicit scope response', async () => {
  let scope: string | undefined = 'openid';
  const srv = await mockServer(() => ({ json: { access_token: 'AT', ...(scope ? { scope } : {}) } }));
  try {
    const c = createOAuthClient(cfg(srv.base(), { requiredScopes: ['chatgpt.tokens.use.direct'] }));
    let s = await c.beginAuthorization(REDIRECT);
    await assert.rejects(c.completeAuthorization(s, `?code=c&state=${s.state}`), (e: OAuthError) => e.code === 'scope-missing');
    scope = 'openid chatgpt.tokens.use.direct';
    s = await c.beginAuthorization(REDIRECT);
    assert.ok((await c.completeAuthorization(s, `?code=c&state=${s.state}`)).scopes.includes('chatgpt.tokens.use.direct'));
  } finally { await srv.close(); }
});
test('refresh: rotation replaces token, no rotation keeps old, single-flight', async () => {
  let n = 0, rotate = true;
  const srv = await mockServer(() => { n++; return { delayMs: 30, json: { access_token: `AT${n}`, ...(rotate ? { refresh_token: `RT${n}` } : {}), expires_in: 10 } }; });
  try {
    const c = createOAuthClient(cfg(srv.base()));
    const old = { refreshToken: 'RT0', scopes: ['openid'] };
    const [a, b] = await Promise.all([c.refresh(old), c.refresh(old)]);
    assert.equal(srv.hits.length, 1); assert.equal(a, b); assert.equal(a.refreshToken, 'RT1');
    assert.equal(srv.hits[0].body.get('grant_type'), 'refresh_token'); assert.equal(srv.hits[0].body.get('refresh_token'), 'RT0');
    rotate = false;
    assert.equal((await c.refresh({ refreshToken: 'RT1', scopes: [] })).refreshToken, 'RT1');
    await assert.rejects(c.refresh({ scopes: [] }), (e: OAuthError) => e.code === 'invalid-grant');
  } finally { await srv.close(); }
});
test('error mapping: invalid_grant, other oauth error, html 500, non-json 200, no access_token, 200 with error, bad expires_in', async () => {
  const cases: Array<[Parameters<typeof mockServer>[0], string]> = [
    [() => ({ status: 400, json: { error: 'invalid_grant', error_description: 'expired' } }), 'invalid-grant'],
    [() => ({ status: 400, json: { error: 'invalid_client' } }), 'token-error'],
    [() => ({ status: 500, text: '<html>oops</html>' }), 'protocol'],
    [() => ({ text: 'not json' }), 'protocol'],
    [() => ({ json: { token_type: 'Bearer' } }), 'protocol'],
    [() => ({ json: { error: 'invalid_grant' } }), 'invalid-grant'],
    [() => ({ json: { access_token: 'x', expires_in: -5 } }), 'protocol'],
  ];
  for (const [h, code] of cases) {
    const srv = await mockServer(h);
    try {
      const c = createOAuthClient(cfg(srv.base()));
      const s = await c.beginAuthorization(REDIRECT);
      await assert.rejects(c.completeAuthorization(s, `?code=SECRETCODE&state=${s.state}`), (e: OAuthError) => { assert.equal(e.code, code); assert.ok(!e.message.includes('SECRETCODE') && !e.message.includes(s.codeVerifier)); return true; });
    } finally { await srv.close(); }
  }
  assert.equal(new OAuthError('invalid-grant', 'x').requiresReauth, true);
});
test('network failure, timeout and abort', async () => {
  const c0 = createOAuthClient(cfg('http://127.0.0.1:1'));
  const s0 = await c0.beginAuthorization(REDIRECT);
  await assert.rejects(c0.completeAuthorization(s0, `?code=c&state=${s0.state}`), (e: OAuthError) => e.code === 'network');
  const srv = await mockServer(() => ({ delayMs: 500, json: { access_token: 'x' } }));
  try {
    const c = createOAuthClient(cfg(srv.base(), { requestTimeoutMs: 50 }));
    const s = await c.beginAuthorization(REDIRECT);
    await assert.rejects(c.completeAuthorization(s, `?code=c&state=${s.state}`), (e: OAuthError) => e.code === 'timeout');
    const ac = new AbortController();
    const c2 = createOAuthClient(cfg(srv.base()));
    const s2 = await c2.beginAuthorization(REDIRECT);
    const p = c2.completeAuthorization(s2, `?code=c&state=${s2.state}`, ac.signal);
    setTimeout(() => ac.abort(), 20);
    await assert.rejects(p, (e: OAuthError) => e.code === 'cancelled');
  } finally { await srv.close(); }
});

// ---- id_token --------------------------------------------------------------------------------
const b64 = (o: unknown) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function jwt(alg: 'RS256' | 'PS256' | 'ES256', key: KeyObject, claims: object, kid = 'k1') {
  const head = `${b64({ alg, kid, typ: 'JWT' })}.${b64(claims)}`;
  const sig = alg === 'RS256' ? createSign('RSA-SHA256').update(head).sign(key) : alg === 'PS256' ? nodeSign('sha256', Buffer.from(head), { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }) : nodeSign('sha256', Buffer.from(head), { key, dsaEncoding: 'ieee-p1363' });
  return `${head}.${sig.toString('base64url')}`;
}
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = (k: KeyObject, kid: string): Jwk => ({ ...(k.export({ format: 'jwk' }) as Jwk), kid, use: 'sig' });
const NOW = 1_800_000_000_000;
const claims = (o = {}) => ({ iss: 'https://iss', aud: 'oaiapp_1', exp: NOW / 1000 + 600, iat: NOW / 1000, nonce: 'N', ...o });
const exp = (o = {}) => ({ issuer: 'https://iss', audience: 'oaiapp_1', nonce: 'N', jwks: [jwk(rsa.publicKey, 'k1'), jwk(ec.publicKey, 'k2')], now: () => NOW, ...o });

test('verifyIdToken accepts RS256 and ES256, rejects every tampering', async () => {
  assert.equal((await verifyIdToken(jwt('RS256', rsa.privateKey, claims()), exp())).aud, 'oaiapp_1');
  assert.ok(await verifyIdToken(jwt('PS256', rsa.privateKey, claims()), exp()));
  await assert.rejects(verifyIdToken(jwt('RS256', rsa.privateKey, claims()), exp({ algorithms: ['PS256'] })), (e: OAuthError) => e.code === 'id-token-invalid');
  assert.ok(await verifyIdToken(jwt('ES256', ec.privateKey, claims(), 'k2'), exp()));
  assert.ok(await verifyIdToken(jwt('RS256', rsa.privateKey, claims({ aud: ['x', 'oaiapp_1'] })), exp()));
  const code = async (p: Promise<unknown>) => { try { await p; } catch (e) { return (e as OAuthError).code; } };
  assert.equal(await code(verifyIdToken(jwt('RS256', rsa.privateKey, claims({ iss: 'https://evil' })), exp())), 'id-token-invalid');
  assert.equal(await code(verifyIdToken(jwt('RS256', rsa.privateKey, claims({ aud: 'other' })), exp())), 'id-token-invalid');
  assert.equal(await code(verifyIdToken(jwt('RS256', rsa.privateKey, claims({ exp: NOW / 1000 - 1000 })), exp())), 'id-token-invalid');
  assert.equal(await code(verifyIdToken(jwt('RS256', rsa.privateKey, claims({ nonce: 'other' })), exp())), 'nonce-mismatch');
  assert.equal(await code(verifyIdToken(jwt('RS256', rsa.privateKey, claims({ nonce: undefined })), exp())), 'nonce-mismatch');
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  assert.equal(await code(verifyIdToken(jwt('RS256', other.privateKey, claims()), exp())), 'id-token-invalid');
  const good = jwt('RS256', rsa.privateKey, claims());
  const [h, p, s] = good.split('.');
  assert.equal(await code(verifyIdToken(`${h}.${b64(claims({ aud: 'x' }))}.${s}`, exp())), 'id-token-invalid');
  assert.equal(await code(verifyIdToken(`${b64({ alg: 'none' })}.${p}.`, exp())), 'id-token-invalid');
  assert.equal(await code(verifyIdToken(`${b64({ alg: 'HS256' })}.${p}.${s}`, exp())), 'id-token-invalid');
  assert.equal(await code(verifyIdToken('garbage', exp())), 'id-token-invalid');
  assert.ok(await verifyIdToken(good, exp({ nonce: undefined, jwks: async () => [jwk(rsa.publicKey, 'k1')] })));
});
test('client: nonce checked unsigned by default, verifyIdToken hook gets the issued client id', async () => {
  const srv = await mockServer(() => ({ json: { access_token: 'AT', id_token: 'will be replaced' } }));
  try {
    let nonceInToken = '';
    const server2 = await mockServer(() => ({ json: { access_token: 'AT', id_token: `${b64({ alg: 'none' })}.${b64({ nonce: nonceInToken })}.` } }));
    try {
      const c = createOAuthClient(cfg(server2.base(), { useNonce: true }));
      let s = await c.beginAuthorization(REDIRECT);
      nonceInToken = 'wrong';
      await assert.rejects(c.completeAuthorization(s, `?code=c&state=${s.state}`), (e: OAuthError) => e.code === 'nonce-mismatch');
      s = await c.beginAuthorization(REDIRECT); nonceInToken = s.nonce!;
      assert.ok((await c.completeAuthorization(s, `?code=c&state=${s.state}`)).idToken);
      const seen: unknown[] = [];
      const c2 = createOAuthClient(cfg(server2.base(), { acceptIssuedClientId: true, issuer: 'https://iss' }), { verifyIdToken: async (_t, ctx) => { seen.push(ctx); throw new OAuthError('id-token-invalid', 'no'); } });
      const s2 = await c2.beginAuthorization(REDIRECT);
      await assert.rejects(c2.completeAuthorization(s2, `?code=c&state=${s2.state}&client_id=oaiapp_9`), (e: OAuthError) => e.code === 'id-token-invalid');
      assert.deepEqual(seen, [{ clientId: 'oaiapp_9', nonce: undefined, issuer: 'https://iss' }]);
    } finally { await server2.close(); }
  } finally { await srv.close(); }
});

// ---- discovery + revocation ------------------------------------------------------------------
test('discovery fills config; revoke posts token, hint, client id; 400 is tolerated, 500 is not', async () => {
  let status = 200;
  const srv = await mockServer((h) => (h.path === '/revoke' ? { status, json: {} } : { json: {} }));
  try {
    const d = await fetchDiscovery(srv.base());
    assert.equal(d.revocationEndpoint, `${srv.base()}/revoke`); assert.equal(d.issuer, srv.base());
    const config = configFromDiscovery({ clientId: 'cid', scopes: ['openid'] }, d);
    assert.equal(config.tokenEndpoint, `${srv.base()}/token`);
    const c = createOAuthClient(config);
    await c.revoke('RT', 'refresh_token', 'oaiapp_1');
    const hit = srv.hits.find((h) => h.path === '/revoke')!;
    assert.equal(hit.body.get('token'), 'RT'); assert.equal(hit.body.get('token_type_hint'), 'refresh_token'); assert.equal(hit.body.get('client_id'), 'oaiapp_1');
    status = 400; await c.revoke('RT');
    status = 500; await assert.rejects(c.revoke('RT'), (e: OAuthError) => e.code === 'token-error');
    await assert.rejects(createOAuthClient(cfg(srv.base())).revoke('x'), (e: OAuthError) => e.code === 'invalid-config');
    await assert.rejects(fetchDiscovery('http://evil.example'), (e: OAuthError) => e.code === 'insecure-endpoint');
    // issuer mismatch
    const bad = async () => fetchDiscovery(srv.base() + '/sub');
    await assert.rejects(bad(), (e: OAuthError) => e.code === 'issuer-mismatch' || e.code === 'protocol');
  } finally { await srv.close(); }
});

// ---- token manager ---------------------------------------------------------------------------
function memStore(initial?: OAuthTokenSet): TokenStore & { saved: OAuthTokenSet[]; value?: OAuthTokenSet } {
  const s = { saved: [] as OAuthTokenSet[], value: initial, async load() { return s.value; }, async save(t: OAuthTokenSet) { s.saved.push(t); s.value = t; }, async clear() { s.value = undefined; } };
  return s;
}
const tok = (o: Partial<OAuthTokenSet> = {}): OAuthTokenSet => ({ clientId: 'oaiapp_1', accessToken: 'AT0', tokenType: 'Bearer', refreshToken: 'RT0', expiresAt: 10_000, scopes: ['openid'], extra: {}, ...o });
test('token manager: fresh token passes, expired refreshes once for parallel callers, saves rotated token first', async () => {
  let n = 0, clock = 0;
  const srv = await mockServer(() => { n++; return { delayMs: 20, json: { access_token: `AT${n}`, refresh_token: `RT${n}`, expires_in: 3600 } }; });
  try {
    const store = memStore(tok());
    const m = createTokenManager(createOAuthClient(cfg(srv.base()), { now: () => clock }), store, { skewMs: 0 });
    assert.equal(await m.getAccessToken(), 'AT0');
    clock = 20_000;
    const [a, b] = await Promise.all([m.getAccessToken(), m.getAccessToken()]);
    assert.deepEqual([a, b, srv.hits.length], ['AT1', 'AT1', 1]);
    assert.equal(store.value?.refreshToken, 'RT1'); assert.equal(store.value?.clientId, 'oaiapp_1');
    assert.equal(srv.hits[0].body.get('client_id'), 'oaiapp_1');
    assert.equal(await m.getAccessToken({ forceRefresh: true }), 'AT2');
    assert.equal(srv.hits[1].body.get('refresh_token'), 'RT1');
  } finally { await srv.close(); }
});
test('token manager: invalid_grant clears store, transient error keeps it, signed-out store errors', async () => {
  let mode: 'grant' | 'down' = 'down';
  const srv = await mockServer(() => (mode === 'grant' ? { status: 400, json: { error: 'invalid_grant' } } : { status: 503, text: 'busy' }));
  try {
    const store = memStore(tok({ expiresAt: 1 }));
    const m = createTokenManager(createOAuthClient(cfg(srv.base())), store);
    await assert.rejects(m.getAccessToken());
    assert.ok(store.value, 'transient failure keeps the login');
    mode = 'grant';
    await assert.rejects(m.getAccessToken(), (e: OAuthError) => e.requiresReauth);
    assert.equal(store.value, undefined);
    await assert.rejects(m.getAccessToken(), (e: OAuthError) => e.code === 'invalid-grant');
  } finally { await srv.close(); }
});
test('token manager signOut: revokes refresh token and clears even when revoke fails', async () => {
  let status = 200;
  const srv = await mockServer(() => ({ status, json: {} }));
  try {
    const c = createOAuthClient(cfg(srv.base(), { revocationEndpoint: `${srv.base()}/revoke` }));
    const store = memStore(tok());
    const m = createTokenManager(c, store);
    assert.deepEqual(await m.signOut(), { revoked: true, revokeError: undefined });
    assert.equal(srv.hits[0].body.get('token'), 'RT0'); assert.equal(store.value, undefined);
    await store.save(tok()); status = 500;
    const r = await m.signOut();
    assert.equal(r.revoked, false); assert.equal(r.revokeError?.code, 'token-error'); assert.equal(store.value, undefined);
  } finally { await srv.close(); }
});

// ---- loopback + full flow --------------------------------------------------------------------
test('full authorize() flow through a real loopback receiver', async () => {
  const srv = await mockServer(() => ({ json: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600 } }));
  try {
    const c = createOAuthClient(cfg(srv.base()));
    const receiver = await startNodeLoopback({ path: '/auth/callback' });
    assert.match(receiver.redirectUri, /^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/);
    const t = await c.authorize({ receiver, openUrl: async (url) => {
      const p = q(url);
      assert.equal((await fetch(`${p.get('redirect_uri')}?code=XYZ&state=${p.get('state')}`)).status, 200);
    } });
    assert.equal(t.accessToken, 'AT'); assert.equal(srv.hits[0].body.get('code'), 'XYZ');
    await assert.rejects(fetch(receiver.redirectUri), 'receiver closed after flow');
  } finally { await srv.close(); }
});
test('authorize(): denial, wrong state, timeout, cancel, browser open failure all close the receiver', async () => {
  const srv = await mockServer(() => ({ json: { access_token: 'AT' } }));
  try {
    const c = createOAuthClient(cfg(srv.base()));
    const run = async (open: (url: string, redirect: string) => Promise<void> | void, extra: { timeoutMs?: number; signal?: AbortSignal } = {}) => {
      const receiver = await startNodeLoopback();
      try { await c.authorize({ receiver, openUrl: (u) => open(u, receiver.redirectUri), ...extra }); return 'ok'; } catch (e) { 
        await assert.rejects(fetch(receiver.redirectUri), 'receiver must be closed');
        return (e as OAuthError).code; }
    };
    assert.equal(await run(async (u) => { await fetch(`${q(u).get('redirect_uri')}?error=access_denied&state=${q(u).get('state')}`); }), 'access-denied');
    assert.equal(await run(async (u) => { await fetch(`${q(u).get('redirect_uri')}?code=c&state=forged`); }), 'state-mismatch');
    assert.equal(await run(() => {}, { timeoutMs: 50 }), 'timeout');
    const ac = new AbortController();
    assert.equal(await run(() => { setTimeout(() => ac.abort(), 20); }, { signal: ac.signal }), 'cancelled');
    assert.equal(await run(() => { throw new Error('no browser'); }), 'network');
    assert.equal(srv.hits.length, 0, 'no token request without a valid callback');
  } finally { await srv.close(); }
});
test('loopback ignores wrong path/host and handles a second hit after the first', async () => {
  const r = await startNodeLoopback({ path: '/auth/callback' });
  const base = new URL(r.redirectUri).origin;
  const wait = r.waitForCallback();
  assert.equal((await fetch(`${base}/other?code=1&state=s`)).status, 404);
  assert.equal((await fetch(`${base}/auth/callback`, { method: 'POST' })).status, 404);
  assert.equal((await fetch(`${base}/auth/callback?code=1&state=s`)).status, 200);
  assert.equal(await wait, '/auth/callback?code=1&state=s');
  assert.equal((await fetch(`${base}/auth/callback?code=2&state=s`)).status, 409);
  await r.close(); await r.close();
});

test('endpoint allowlist is fail-closed for authorize, token and revocation', () => {
  const ok = { clientId: 'c', scopes: [], authorizeEndpoint: 'https://auth.example/api/accounts/authorize', tokenEndpoint: 'https://auth.example/api/accounts/oauth/token', endpointAllowlist: ['https://auth.example/api/accounts/'] };
  assert.doesNotThrow(() => createOAuthClient(ok));
  const code = (c: object) => { try { createOAuthClient({ ...ok, ...c }); } catch (e) { return (e as OAuthError).code; } };
  assert.equal(code({ tokenEndpoint: 'https://auth0.example/oauth/token' }), 'insecure-endpoint');
  assert.equal(code({ authorizeEndpoint: 'https://auth.example.evil.com/api/accounts/authorize' }), 'insecure-endpoint');
  assert.equal(code({ revocationEndpoint: 'https://other.example/revoke' }), 'insecure-endpoint');
  assert.equal(code({ revocationEndpoint: 'https://auth.example/api/accounts/oauth/revoke' }), undefined);
});
