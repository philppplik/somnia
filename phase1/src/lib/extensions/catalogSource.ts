import type {CatalogEntry} from './catalogValidation';
import {CATALOG_KEYS, SIGNED_INDEX_URL, SIGNED_SIG_URL} from './catalogTrust';
import {fetchSignedPair, verifySignedCatalog, SignedCatalogError, type CatalogStateStore, type CatalogState, type TrustKeyList} from './signedCatalog';

const STATE_KEY = 'somnia.catalog.state.v1', CACHE_KEY = 'somnia.catalog.cache.v1';
const store: CatalogStateStore = {
  async read() {try {const v = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null'); return v && Number.isSafeInteger(v.serial) ? v as CatalogState : null;} catch {return null;}},
  async write(s) {localStorage.setItem(STATE_KEY, JSON.stringify(s));},
};
/** Network failure -> last verified cache, re-verified (signature, expiry, serial) on every use.
 * Verification failures are never papered over by the cache: they surface as errors. */
export async function fetchVerifiedCatalog(signal?: AbortSignal, keys: TrustKeyList = CATALOG_KEYS): Promise<CatalogEntry[]> {
  let pair: {payload: string; signature: string};
  try {pair = await fetchSignedPair(SIGNED_INDEX_URL, SIGNED_SIG_URL, fetch, signal);}
  catch (e) {
    if (e instanceof SignedCatalogError) throw e;
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    if (!cached) throw e;
    return (await verifySignedCatalog(cached, {keys, state: store})).entries;
  }
  const v = await verifySignedCatalog(pair, {keys, state: store});
  try {localStorage.setItem(CACHE_KEY, JSON.stringify(pair));} catch {/* quota: cache is optional */}
  return v.entries;
}
