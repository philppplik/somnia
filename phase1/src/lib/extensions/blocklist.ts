/** Signed-index blocklist consumer. Only the owning host may construct the verifier/cache adapters.
 * Never expose acceptVerified or raw-feed IPC to an extension webview. */
export interface BlockedVersion { id: string; versions: string; reason_url: string }
export interface BlocklistFeed { revision: number; blocked: BlockedVersion[] }
export interface SignedIndex { payload: string; signature: string; verifiedAtMs?: number }
export interface BlocklistCache { read(): Promise<SignedIndex | null>; write(value: SignedIndex): Promise<void> }
export interface InstalledBlocklistExtension { id: string; name: string; version: string; engine: 'sandboxed' | 'native' }
export interface BlocklistHost {
  installed(): Promise<InstalledBlocklistExtension[]>;
  /** Atomically persists blocked status, removes capabilities and awaits runtime destruction.
   * MUST NOT uninstall, delete files, settings, history or secrets. */
  disableBlocked(extension: InstalledBlocklistExtension, block: BlockedVersion, revision: number): Promise<void>;
  /** Clears only the policy lock after a newer feed removes a match. Never auto-enables. */
  clearBlock(id: string, revision: number): Promise<void>;
  notify(extension: InstalledBlocklistExtension, block: BlockedVersion): Promise<void>;
}
export type FeedStatus = { state: 'fresh' | 'offline' | 'invalid' | 'never-fetched'; checkedAt: string | null; lastVerifiedAt: string | null; offlineDays: number | null; revision: number | null };
const ID = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;
function version(v: string): [number, number, number, string[]] {
  const m = VERSION.exec(v); if (!m) throw Error('Invalid blocklist version');
  const numbers = m.slice(1, 4).map(Number); if (numbers.some(n => !Number.isSafeInteger(n))) throw Error('Invalid blocklist version');
  const pre = m[4]?.split('.') ?? []; if (pre.some(p => /^\d+$/.test(p) && p.length > 1 && p[0] === '0')) throw Error('Invalid prerelease');
  return [numbers[0], numbers[1], numbers[2], pre];
}
function compare(a: string, b: string): number {
  const x = version(a), y = version(b);
  for (let i = 0; i < 3; i++) { const d = (x[i] as number) - (y[i] as number); if (d) return Math.sign(d); }
  if (!x[3].length || !y[3].length) return x[3].length ? -1 : y[3].length ? 1 : 0;
  for (let i = 0; i < Math.max(x[3].length, y[3].length); i++) {
    const p = x[3][i], q = y[3][i]; if (p === q) continue;
    if (p === undefined) return -1; if (q === undefined) return 1;
    const pn = /^\d+$/.test(p), qn = /^\d+$/.test(q);
    if (pn && qn) return p.length === q.length ? p < q ? -1 : 1 : p.length < q.length ? -1 : 1;
    if (pn !== qn) return pn ? -1 : 1; return p < q ? -1 : 1;
  }
  return 0;
}
/** Deliberately closed range grammar: *, exact semver, comparator conjunctions and ||.
 * Unsupported npm shorthand (^/~, partials, hyphens) rejects the entire feed, not a missed block. */
function compileRange(range: string): (v: string) => boolean {
  if (range === '*') return v => { version(v); return true; };
  if (!range.trim() || range.length > 500) throw Error('Invalid blocklist range');
  const groups = range.split('||').map(group => {
    const parts = group.trim().split(/\s+/);
    return parts.map(part => { const m = /^(>=|<=|>|<|=)?(.+)$/.exec(part)!; version(m[2]); return { op: m[1] ?? '=', value: m[2] }; });
  });
  return v => { version(v); return groups.some(group => group.every(({ op, value }) => { const d = compare(v, value); return op === '=' ? d === 0 : op === '>=' ? d >= 0 : op === '<=' ? d <= 0 : op === '>' ? d > 0 : d < 0; })); };
}
export const matchesBlockedVersion = (v: string, range: string): boolean => compileRange(range)(v);
function parseFeed(payload: string): BlocklistFeed {
  if (payload.length > 4 * 1024 * 1024) throw Error('Index too large');
  const data: unknown = JSON.parse(payload);
  if (!data || typeof data !== 'object') throw Error('Invalid index');
  const x = data as Record<string, unknown>;
  if (!Number.isSafeInteger(x.revision) || (x.revision as number) < 0 || !Array.isArray(x.blocked) || x.blocked.length > 10000) throw Error('Invalid blocklist');
  const blocked = x.blocked.map(value => {
    if (!value || typeof value !== 'object') throw Error('Invalid blocklist entry');
    const b = value as Record<string, unknown>;
    if (typeof b.id !== 'string' || b.id.length > 100 || !ID.test(b.id) || typeof b.versions !== 'string' || typeof b.reason_url !== 'string') throw Error('Invalid blocklist entry');
    compileRange(b.versions);
    const u = new URL(b.reason_url); if (u.protocol !== 'https:' || u.username || u.password || b.reason_url.length > 2048) throw Error('Invalid blocklist reason link');
    return { id: b.id, versions: b.versions, reason_url: b.reason_url };
  });
  return { revision: x.revision as number, blocked };
}
export class BlocklistService {
  private feed: BlocklistFeed | null = null;
  private checkedAt: number | null = null;
  private lastVerifiedAt: number | null = null;
  private state: FeedStatus['state'] = 'never-fetched';
  private notified = new Set<string>();
  private running: Promise<FeedStatus> | null = null;
  constructor(private cache: BlocklistCache, private verify: (signed: SignedIndex) => Promise<boolean>, private host: BlocklistHost, private now: () => number = Date.now) {}
  status(): FeedStatus { return { state: this.state, checkedAt: this.checkedAt === null ? null : new Date(this.checkedAt).toISOString(), lastVerifiedAt: this.lastVerifiedAt === null ? null : new Date(this.lastVerifiedAt).toISOString(), offlineDays: this.lastVerifiedAt === null ? null : Math.floor((this.now() - this.lastVerifiedAt) / 86400000), revision: this.feed?.revision ?? null }; }
  /** On every startup, verify stored bytes again. No network expiry disables healthy extensions. */
  async start(): Promise<FeedStatus> {
    let cached: SignedIndex | null;
    try { cached = await this.cache.read(); } catch { this.state = 'invalid'; return this.status(); }
    if (cached) { try { await this.accept(cached, false); this.state = 'offline'; } catch { this.state = 'invalid'; } }
    await this.enforce(); return this.status();
  }
  /** Caller runs at launch and every 24h. Concurrent checks coalesce. HTTP failures are offline;
   * bad signatures/schema/rollback are invalid. Both keep the last verified policy. */
  refresh(fetchSigned: () => Promise<SignedIndex>): Promise<FeedStatus> {
    if (this.running) return this.running;
    this.running = this.refreshOnce(fetchSigned).finally(() => { this.running = null; }); return this.running;
  }
  private async refreshOnce(fetchSigned: () => Promise<SignedIndex>): Promise<FeedStatus> {
    this.checkedAt = this.now();
    let signed: SignedIndex;
    try { signed = await fetchSigned(); } catch { this.state = 'offline'; await this.enforce(); return this.status(); }
    try { await this.accept(signed, true); this.state = 'fresh'; } catch { this.state = 'invalid'; }
    await this.enforce(); return this.status();
  }
  private async accept(signed: SignedIndex, persist: boolean): Promise<void> {
    if (!signed || typeof signed.payload !== 'string' || typeof signed.signature !== 'string' || signed.payload.length > 4 * 1024 * 1024 || signed.signature.length > 512 || !await this.verify(signed)) throw Error('Invalid index signature');
    const next = parseFeed(signed.payload);
    if (this.feed && next.revision < this.feed.revision) throw Error('Index rollback');
    // Same revision must not change policy. This also prevents ambiguous cache state.
    if (this.feed && next.revision === this.feed.revision && JSON.stringify(next) !== JSON.stringify(this.feed)) throw Error('Index revision conflict');
    const verifiedAtMs = persist ? this.now() : signed.verifiedAtMs;
    if (persist) await this.cache.write({ ...signed, verifiedAtMs });
    this.feed = next;
    this.lastVerifiedAt = typeof verifiedAtMs === 'number' && Number.isFinite(verifiedAtMs) && verifiedAtMs >= 0 && verifiedAtMs <= this.now() ? verifiedAtMs : null;
  }
  /** Also call before each enable/load/install/update. Applies to BOTH tiers, not only native. */
  blocked(id: string, installedVersion: string): BlockedVersion | null {
    return this.feed?.blocked.find(b => b.id === id && matchesBlockedVersion(installedVersion, b.versions)) ?? null;
  }
  async enforce(): Promise<void> {
    if (!this.feed) return;
    for (const ext of await this.host.installed()) {
      const block = this.blocked(ext.id, ext.version);
      if (!block) { await this.host.clearBlock(ext.id, this.feed.revision); continue; }
      await this.host.disableBlocked(ext, block, this.feed.revision);
      const key = `${ext.id}@${ext.version}:${block.reason_url}`;
      if (!this.notified.has(key)) { await this.host.notify(ext, block); this.notified.add(key); }
    }
  }
}
/** Real Ed25519 verification of the EXACT UTF-8 index bytes. The 32-byte public key must
 * come from the bundled host configuration, never from index content or a downloaded key. */
export function ed25519IndexVerifier(publicKey: Uint8Array, cryptoApi: Crypto = globalThis.crypto): (signed: SignedIndex) => Promise<boolean> {
  if (publicKey.length !== 32) throw Error('Ed25519 public key must be 32 bytes');
  const key = cryptoApi.subtle.importKey('raw', publicKey.slice().buffer, { name: 'Ed25519' }, false, ['verify']);
  return async signed => {
    try {
      if (!/^[A-Za-z0-9+/]{86}==$/.test(signed.signature)) return false;
      const bytes = Uint8Array.from(atob(signed.signature), c => c.charCodeAt(0));
      return await cryptoApi.subtle.verify({ name: 'Ed25519' }, await key, bytes, new TextEncoder().encode(signed.payload));
    } catch { return false; }
  };
}
/** Transport-only fetch. Feed and detached-signature URLs are resolved by the signed-store
 * configuration. Redirects are rejected rather than widening the expected source silently. */
export function signedIndexFetcher(indexUrl: string, signatureUrl: string, fetcher: typeof fetch = fetch): () => Promise<SignedIndex> {
  for (const input of [indexUrl, signatureUrl]) { const u = new URL(input); if (u.protocol !== 'https:' || u.username || u.password) throw Error('Index transport requires HTTPS'); }
  const bounded = async (url: string, cap: number): Promise<string> => {
    const response = await fetcher(url, { redirect: 'error', cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(15000) });
    if (!response.ok || !response.body) throw Error('Index transport unavailable');
    const reader = response.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
    try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > cap) throw Error('Index transport exceeds size limit'); parts.push(value); } }
    finally { await reader.cancel(); reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0; for (const p of parts) { bytes.set(p, offset); offset += p.length; }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  };
  return async () => { const [payload, signature] = await Promise.all([bounded(indexUrl, 4 * 1024 * 1024), bounded(signatureUrl, 512)]); return { payload, signature: signature.trim() }; };
}
/** Launch check + 24h cadence. Errors are reported to the owning host, never dropped.
 * Caller must dispose on host shutdown. No faster account polling. */
export function monitorBlocklist(service: BlocklistService, fetchSigned: () => Promise<SignedIndex>, report: (status: FeedStatus | Error) => void): () => void {
  let stopped = false;
  const check = async () => { try { const state = await service.refresh(fetchSigned); if (!stopped) report(state); } catch (e) { if (!stopped) report(e instanceof Error ? e : new Error(String(e))); } };
  void service.start().then(check).catch(e => { if (!stopped) report(e instanceof Error ? e : new Error(String(e))); });
  const timer = setInterval(() => { void check(); }, 24 * 60 * 60 * 1000);
  return () => { stopped = true; clearInterval(timer); };
}
