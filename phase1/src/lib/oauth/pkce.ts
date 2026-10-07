/** RFC 7636 helpers on Web Crypto (browser, Tauri webview, Node >= 20). */

export type RandomBytes = (length: number) => Uint8Array;

export const defaultRandomBytes: RandomBytes = (length) => {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function base64Url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }
  if (i + 1 === bytes.length) {
    const n = bytes[i] << 16;
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
  } else if (i + 2 === bytes.length) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63];
  }
  return out;
}

export function base64UrlDecode(text: string): Uint8Array {
  const clean = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 32 random bytes -> 43 base64url chars, the RFC 7636 minimum length and entropy. */
export function createCodeVerifier(random: RandomBytes = defaultRandomBytes, byteLength = 32): string {
  if (!Number.isInteger(byteLength) || byteLength < 32 || byteLength > 96) throw new RangeError('PKCE verifier needs 32..96 random bytes');
  return base64Url(random(byteLength));
}

export async function codeChallengeS256(verifier: string): Promise<string> {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) throw new RangeError('Invalid PKCE code verifier');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/** Opaque unguessable value for `state` / `nonce`. */
export function randomToken(random: RandomBytes = defaultRandomBytes, byteLength = 32): string {
  return base64Url(random(byteLength));
}

/** Length-leaking-only comparison; fine for fixed-length random tokens. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
