/** Signed extension catalog (schema 2). Stage A of the store hardening: the app verifies a detached
 * Ed25519 signature over the EXACT index bytes with a bundled public key before the index is parsed for
 * display or install. Rollback (serial), expiry and key rotation are enforced here.
 * A signature proves who published the index. It does not prove an extension is safe. */
import {validateCatalog,type CatalogEntry} from './catalogValidation';

export interface TrustedKey {keyId: string; publicKey: Uint8Array}
export type TrustKeyList = readonly TrustedKey[];
export interface Revocation {id: string; versions: string[]; reason: string}
export interface SignedCatalog {schemaVersion: 2; serial: number; issuedAt: string; expiresAt: string; keyId: string; extensions: CatalogEntry[]; revoked: Revocation[]}
export interface CatalogState {serial: number; payloadSha256: string; verifiedAtMs: number}
export interface CatalogStateStore {read(): Promise<CatalogState | null>; write(s: CatalogState): Promise<void>}
export type SignedCatalogErrorCode = 'no-keys' | 'bad-signature' | 'unknown-key' | 'invalid' | 'expired' | 'rollback' | 'conflict' | 'clock-rollback' | 'future';
export class SignedCatalogError extends Error {constructor(public code: SignedCatalogErrorCode, message: string) {super(message);}}

export const MAX_SIGNED_INDEX = 400_000;
export const MAX_VALIDITY_MS = 30 * 86_400_000;
const MAX_SKEW_MS = 10 * 60_000;
const ID = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*$/;
const VER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const rec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
export const sha256Hex = async (text: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

/** Exact-bytes Ed25519 verification against ONE pinned key. Keys never come from index content. */
export async function verifyEd25519(key: TrustedKey, payload: string, signatureB64: string, cryptoApi: Crypto = globalThis.crypto): Promise<boolean> {
  try {
    if (key.publicKey.length !== 32 || !/^[A-Za-z0-9+/]{86}==$/.test(signatureB64.trim())) return false;
    const k = await cryptoApi.subtle.importKey('raw', key.publicKey.slice().buffer, {name: 'Ed25519'}, false, ['verify']);
    return await cryptoApi.subtle.verify({name: 'Ed25519'}, k, fromB64(signatureB64.trim()), new TextEncoder().encode(payload));
  } catch {return false;}
}

function parseTime(v: unknown, what: string): number {
  if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(v) || !Number.isFinite(Date.parse(v))) throw new SignedCatalogError('invalid', `Invalid ${what}.`);
  return Date.parse(v);
}
export function parseSignedCatalog(payload: string): SignedCatalog {
  if (payload.length > MAX_SIGNED_INDEX) throw new SignedCatalogError('invalid', 'Index too large.');
  let data: unknown; try {data = JSON.parse(payload);} catch {throw new SignedCatalogError('invalid', 'Index is not valid JSON.');}
  if (!rec(data) || data.schemaVersion !== 2 || !Number.isSafeInteger(data.serial) || (data.serial as number) < 1 || typeof data.keyId !== 'string' || !Array.isArray(data.extensions) || !Array.isArray(data.revoked) || data.revoked.length > 5000) throw new SignedCatalogError('invalid', 'Unsupported or invalid signed index.');
  const issued = parseTime(data.issuedAt, 'issuedAt'), expires = parseTime(data.expiresAt, 'expiresAt');
  if (expires <= issued || expires - issued > MAX_VALIDITY_MS) throw new SignedCatalogError('invalid', 'Index validity window is invalid (max 30 days).');
  let extensions: CatalogEntry[]; try {extensions = validateCatalog({schemaVersion: 1, extensions: data.extensions});} catch (e) {throw new SignedCatalogError('invalid', String(e instanceof Error ? e.message : e));}
  const revoked = data.revoked.map((r, i): Revocation => {
    if (!rec(r) || typeof r.id !== 'string' || !ID.test(r.id) || r.id.length > 100 || !Array.isArray(r.versions) || !r.versions.length || r.versions.length > 500 || !r.versions.every(v => typeof v === 'string' && VER.test(v)) || typeof r.reason !== 'string' || r.reason.length > 500) throw new SignedCatalogError('invalid', `Invalid revocation ${i + 1}.`);
    return {id: r.id, versions: r.versions as string[], reason: r.reason};
  });
  return {schemaVersion: 2, serial: data.serial as number, issuedAt: data.issuedAt as string, expiresAt: data.expiresAt as string, keyId: data.keyId, extensions, revoked};
}
export const isRevoked = (c: Pick<SignedCatalog, 'revoked'>, id: string, version: string) => c.revoked.some(r => r.id === id && r.versions.includes(version));

export interface VerifyOptions {keys: readonly TrustedKey[]; state: CatalogStateStore; now?: () => number; cryptoApi?: Crypto}
export interface VerifiedCatalog {catalog: SignedCatalog; entries: CatalogEntry[]; payloadSha256: string}
/** Order: key/signature, parse, expiry, rollback, then persist. Nothing is returned before all pass.
 * The signature is checked against the key named in the (untrusted) payload only after parsing is bounded,
 * but the key itself must be one of the pinned keys; any pinned key may verify so rotation never needs a flag day. */
export async function verifySignedCatalog(signed: {payload: string; signature: string}, o: VerifyOptions): Promise<VerifiedCatalog> {
  const now = (o.now ?? Date.now)();
  if (!o.keys.length) throw new SignedCatalogError('no-keys', 'No catalog signing key is configured.');
  if (typeof signed.payload !== 'string' || typeof signed.signature !== 'string' || signed.payload.length > MAX_SIGNED_INDEX) throw new SignedCatalogError('invalid', 'Malformed index transport.');
  let ok = false; for (const k of o.keys) if (await verifyEd25519(k, signed.payload, signed.signature, o.cryptoApi)) {ok = true; break;}
  if (!ok) throw new SignedCatalogError('bad-signature', 'Catalog signature does not verify. Nothing was loaded.');
  const catalog = parseSignedCatalog(signed.payload);
  if (!o.keys.some(k => k.keyId === catalog.keyId)) throw new SignedCatalogError('unknown-key', 'Index names an unpinned key.');
  if (now >= Date.parse(catalog.expiresAt)) throw new SignedCatalogError('expired', 'Catalog index has expired. Installed extensions keep running; installs and updates are paused.');
  if (Date.parse(catalog.issuedAt) > now + MAX_SKEW_MS) throw new SignedCatalogError('future', 'Index is dated in the future.');
  const prev = await o.state.read(); const digest = await sha256Hex(signed.payload);
  if (prev) {
    if (now < prev.verifiedAtMs - MAX_SKEW_MS) throw new SignedCatalogError('clock-rollback', 'System clock moved backwards.');
    if (catalog.serial < prev.serial) throw new SignedCatalogError('rollback', 'Catalog serial is older than the last verified one.');
    if (catalog.serial === prev.serial && digest !== prev.payloadSha256) throw new SignedCatalogError('conflict', 'Same serial with different content.');
  }
  await o.state.write({serial: catalog.serial, payloadSha256: digest, verifiedAtMs: Math.max(now, prev?.verifiedAtMs ?? 0)});
  const entries = catalog.extensions.filter(e => !isRevoked(catalog, e.id, e.version));
  return {catalog, entries, payloadSha256: digest};
}

/** Transport only: bounded HTTPS fetch of index + detached signature, no redirects, no credentials. */
export async function fetchSignedPair(indexUrl: string, sigUrl: string, f: typeof fetch = fetch, signal?: AbortSignal): Promise<{payload: string; signature: string}> {
  for (const u of [indexUrl, sigUrl]) {const p = new URL(u); if (p.protocol !== 'https:' || p.username || p.password || p.hash) throw new SignedCatalogError('invalid', 'HTTPS required.');}
  const get = async (u: string, cap: number) => {
    const sig = signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
    const r = await f(u, {signal: sig, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store'});
    if (!r.ok) throw new Error(`Catalog download failed (${r.status}).`);
    const text = await r.text(); if (text.length > cap) throw new SignedCatalogError('invalid', 'Download is too large.'); return text;
  };
  const [payload, signature] = await Promise.all([get(indexUrl, MAX_SIGNED_INDEX), get(sigUrl, 512)]);
  return {payload, signature: signature.trim()};
}
