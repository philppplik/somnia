import type {RuntimeSnapshot} from './localModels';
/** Empty is known only after a successful installed inventory, never from unreadable metadata. */
export function inventoryEmpty(snapshot:RuntimeSnapshot|null):boolean{return snapshot?.state==='running'&&!snapshot.inventoryError&&snapshot.models.length===0;}
export function parseHelperStorage(value:unknown):{bytes:number;files:number;present:boolean}{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid helper storage');const v=value as Record<string,unknown>;if(Object.keys(v).some(k=>!['bytes','files','present'].includes(k))||!Number.isSafeInteger(v.bytes)||Number(v.bytes)<0||!Number.isSafeInteger(v.files)||Number(v.files)<0||typeof v.present!=='boolean'||(!v.present&&(v.bytes!==0||v.files!==0)))throw Error('Invalid helper storage');return {bytes:v.bytes as number,files:v.files as number,present:v.present};}
/** Newer reads invalidate older responses; dispose prevents any later mounted-state write. */
export class SettingsReadGeneration{private value=0;private live=true;begin(){return ++this.value;}current(token:number){return this.live&&token===this.value;}dispose(){this.live=false;this.value++;}}
