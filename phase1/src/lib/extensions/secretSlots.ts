import type {ManifestV2} from './manifestV2';
import {securityOf} from './securityPolicy';
import {PermissionError} from './permissionBroker';
/** Implement using OS keychain (desktop). This interface is trusted Settings only.
 * Guest RPC gets injection metadata, never any read/set/delete operation.
 */
export interface SecretSlotStore {
  set(namespace:string,slot:string,value:string):Promise<void>;
  delete(namespace:string,slot:string):Promise<void>;
  exists(namespace:string,slot:string):Promise<boolean>;
}
export const secretNamespace=(id:string):string=>{
  if(!/^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)?$/.test(id))throw new PermissionError('E_INVALID_ARGUMENT');
  return `somnia.extensions.${encodeURIComponent(id)}`;
};
/** Never persist secret values in consent JSON, localStorage, activity events or logs. */
export class SecretSlotSettings {
  constructor(private readonly store:SecretSlotStore){}
  private validate(manifest:ManifestV2,slot:string):string {
    if(!securityOf(manifest).secrets?.includes(slot))throw new PermissionError('E_UNDECLARED_SECRET');
    return secretNamespace(manifest.id);
  }
  async list(manifest:ManifestV2):Promise<{slot:string; configured:boolean}[]> {
    const namespace=secretNamespace(manifest.id);
    return Promise.all((securityOf(manifest).secrets??[]).map(async slot=>({slot,configured:await this.store.exists(namespace,slot)})));
  }
  async set(manifest:ManifestV2,slot:string,value:string):Promise<void> {
    const namespace=this.validate(manifest,slot);
    if(typeof value!=='string'||value.length===0||new TextEncoder().encode(value).length>8192||/[\u0000-\u001f\u007f]/.test(value))throw new PermissionError('E_INVALID_SECRET');
    await this.store.set(namespace,slot,value);
  }
  async delete(manifest:ManifestV2,slot:string):Promise<void> {await this.store.delete(this.validate(manifest,slot),slot);}
}
