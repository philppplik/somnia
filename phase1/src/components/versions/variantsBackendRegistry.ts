import type {GitVariantsBackend} from '../../lib/git/types';
let current:GitVariantsBackend|null=null;
/** Tests and the web preview register a fake; the desktop app uses the Tauri adapter. */
export const setVariantsBackend=(b:GitVariantsBackend|null)=>{current=b;};
export const getVariantsBackend=()=>current;
