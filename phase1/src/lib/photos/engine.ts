import {validateDevelop,validatePhotoInput,type DevelopSettings} from './registry';
export type PhotosRequest={id:number;wasmUrl:string}&({op:'load';bytes:ArrayBuffer}|{op:'render';settings:DevelopSettings}|{op:'export';settings:DevelopSettings;format:'png'|'jpeg'});
export interface PhotosResponse{id:number;ok:boolean;error?:string;bytes?:ArrayBuffer;width?:number;height?:number;raw?:boolean}
/** A single source per scoped instance. Disposal cancels CPU work by terminating the worker. */
export class PhotosEngine{
 private worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
 private serial=0;private disposed=false;
 private pending=new Map<number,{resolve:(r:PhotosResponse)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 constructor(){this.worker.onmessage=({data}:MessageEvent<PhotosResponse>)=>{const p=this.pending.get(data.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(data.id);data.ok?p.resolve(data):p.reject(Error(data.error??'Develop failed.'));};this.worker.onerror=e=>this.dispose(Error(e.message||'Develop worker failed.'));this.worker.onmessageerror=()=>this.dispose(Error('Invalid Develop response.'));}
 private request(data:PhotosRequest,transfers:Transferable[]=[]){return new Promise<PhotosResponse>((resolve,reject)=>{if(this.disposed){reject(Error('Develop engine disposed.'));return;}const timer=setTimeout(()=>this.dispose(Error('Develop timed out. Close and reopen the tab to retry.')),30000);this.pending.set(data.id,{resolve,reject,timer});try{this.worker.postMessage(data,transfers);}catch(e){clearTimeout(timer);this.pending.delete(data.id);reject(e);}});}
 private base(){return {id:++this.serial,wasmUrl:new URL('../../../photos-engine/pkg/somnia_photos_spike_bg.wasm',import.meta.url).href};}
 load(bytes:ArrayBuffer){validatePhotoInput(bytes);return this.request({...this.base(),op:'load',bytes},[bytes]);}
 render(settings:DevelopSettings){validateDevelop(settings);return this.request({...this.base(),op:'render',settings});}
 export(settings:DevelopSettings,format:'png'|'jpeg'){validateDevelop(settings);return this.request({...this.base(),op:'export',settings,format});}
 dispose(error=Error('Develop engine disposed.')){if(this.disposed)return;this.disposed=true;this.worker.terminate();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();}
}
