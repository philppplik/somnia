import type {TrustedKey} from './signedCatalog';
/** Pinned catalog signing keys. Holds the maintainer public key k1 (32-byte Ed25519, hex).
 * While empty the app would keep the legacy unsigned index. Once a key is added the legacy path is never used again.
 * Never read keys from the index or from the network. Two entries (current + next) allow rotation. */
const PINNED_HEX: ReadonlyArray<{keyId: string; hex: string}> = [{keyId: 'k1', hex: '2a35f621bf209470c964c32a5fe92cede9ff3bf045b7de2247916a4b9039870b'}];
export const CATALOG_KEYS: readonly TrustedKey[] = PINNED_HEX.map(k => ({keyId: k.keyId, publicKey: Uint8Array.from(k.hex.match(/../g) ?? [], h => parseInt(h, 16))}));
export const SIGNED_CATALOG_REQUIRED = CATALOG_KEYS.length > 0;
const BASE = 'https://raw.githubusercontent.com/philppplik/somnia-extensions/published/catalog/';
export const SIGNED_INDEX_URL = BASE + 'index.json';
export const SIGNED_SIG_URL = BASE + 'index.json.sig';
