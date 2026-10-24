import {setAutoCheck} from './updates';
/** First-start handoff from the custom installer: seeds the app's own "check for updates" setting once. */
export interface Handoff{fresh_install:boolean;written_at:number;auto_update_check:boolean}
export const SEEDED_KEY='somnia.installer.seeded';
/** Only a first installation seeds, and each installer run is applied once (never re-overrides later in-app changes). */
export const shouldSeed=(h:Handoff|null,seeded:string|null):h is Handoff=>!!h&&h.fresh_install&&String(h.written_at)!==seeded;
export async function seedFromInstaller(take:(cmd:string)=>Promise<Handoff|null>,storage:Pick<Storage,'getItem'|'setItem'>=localStorage,apply:(on:boolean)=>void=setAutoCheck):Promise<boolean>{
 const h=await take('installer_handoff_take');
 if(!shouldSeed(h,storage.getItem(SEEDED_KEY)))return false;
 apply(h.auto_update_check);storage.setItem(SEEDED_KEY,String(h.written_at));return true;}
