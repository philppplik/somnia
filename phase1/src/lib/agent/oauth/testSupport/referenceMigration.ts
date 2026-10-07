import type {FakeCredentialStore} from './fakeCredentialStore';
import {SERVICE} from './referenceSubject';
/** Reference for the storage migration contract (legacy single-key entries -> versioned connection records). Test-side only. */
export type Conn={v:2;id:string;provider:string;auth:'api-key';generation:number};
export const LEGACY_PROVIDERS=['openrouter','openai','claude'] as const;
export function migrateLegacyKeys(store:FakeCredentialStore){
 const idx:Conn[]=JSON.parse(store.get(SERVICE,'connections/index')??'[]');
 for(const p of LEGACY_PROVIDERS){
  const legacy=store.get(SERVICE,p);if(legacy===null)continue;
  if(idx.some(c=>c.provider===p&&c.auth==='api-key'))continue; // idempotent
  const id=`conn-${p}-1`;
  store.set(SERVICE,`connections/${id}/g1`,legacy);        // 1. write new generation
  idx.push({v:2,id,provider:p,auth:'api-key',generation:1});
  store.set(SERVICE,'connections/index',JSON.stringify(idx)); // 2. commit pointer
  store.delete(SERVICE,p);                                  // 3. only then drop the legacy entry
 }
}
