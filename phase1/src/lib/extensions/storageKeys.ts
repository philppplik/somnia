/** Per-extension storage key layout. Extension ids look like "vendor.name" and keys may contain dots,
 * so the raw id can never be a key prefix: "a.b" + "c" and "a" + "b.c" would collide. The id is URL-escaped
 * (dots included) and the first unescaped dot separates id and key. Legacy raw-id keys are migrated lazily. */
const ROOT='somnia.ext.';
const esc=(s:string)=>encodeURIComponent(s).replace(/\./g,'%2E');
export const storagePrefix=(extId:string)=>`${ROOT}${esc(extId)}.`;
/** One-time copy of raw-id keys into the escaped layout. Idempotent; legacy keys are removed afterwards. */
export function migrateStorageKeys(extId:string,store:Pick<Storage,'length'|'key'|'getItem'|'setItem'|'removeItem'>){
 const legacy=`${ROOT}${extId}.`;
 if(legacy===storagePrefix(extId))return;
 const move:string[]=[];
 for(let i=0;i<store.length;i++){const k=store.key(i);if(k&&k.startsWith(legacy))move.push(k);}
 for(const k of move){const next=storagePrefix(extId)+k.slice(legacy.length);if(store.getItem(next)===null){const v=store.getItem(k);if(v!==null)store.setItem(next,v);}store.removeItem(k);}
}
export const MAX_STORAGE_KEYS=200;
/** F7: values are capped per key, but the number of keys must be capped too, or an extension fills the profile. */
export function countStorageKeys(extId:string,store:Pick<Storage,'length'|'key'>){
 const prefix=storagePrefix(extId);let n=0;
 for(let i=0;i<store.length;i++){const k=store.key(i);if(k&&k.startsWith(prefix))n++;}
 return n;
}
