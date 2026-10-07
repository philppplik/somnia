/**
 * In-memory stand-in for the OS credential store (keyring) with failure injection.
 * Mirrors the semantics the production broker relies on: named entries, string values, locked store, per-write failure,
 * crash-between-writes simulation. It never touches disk.
 */
export class StoreLockedError extends Error{constructor(){super('OS credential store is locked.');this.name='StoreLockedError';}}
export class FakeCredentialStore{
 private data=new Map<string,string>();
 locked=false;
 /** Fail the Nth write from now (1 = next write). */
 failWriteAt:number|null=null;
 /** Every write fails until cleared (disk full, keychain denied). */
 failAllWrites=false;
 /** Max value size, like Windows Credential Manager blobs (2560 bytes). 0 = unlimited. */
 maxBytes=0;
 readonly ops:{op:'get'|'set'|'delete';key:string}[]=[];
 private key=(service:string,name:string)=>service+'\u0000'+name;
 get(service:string,name:string):string|null{this.ops.push({op:'get',key:name});if(this.locked)throw new StoreLockedError();return this.data.get(this.key(service,name))??null;}
 set(service:string,name:string,value:string){
  this.ops.push({op:'set',key:name});if(this.locked)throw new StoreLockedError();
  if(this.failAllWrites)throw new Error('write failed');
  if(this.failWriteAt!==null&&--this.failWriteAt===0){this.failWriteAt=null;throw new Error('write failed');}
  if(this.maxBytes&&Buffer.byteLength(value)>this.maxBytes)throw new Error('value too large');
  this.data.set(this.key(service,name),value);
 }
 delete(service:string,name:string){this.ops.push({op:'delete',key:name});if(this.locked)throw new StoreLockedError();this.data.delete(this.key(service,name));}
 names(service:string){return [...this.data.keys()].filter(k=>k.startsWith(service+'\u0000')).map(k=>k.slice(service.length+1)).sort();}
 /** Raw dump for leak assertions: no secret may appear anywhere except inside this store. */
 dump(){return JSON.stringify([...this.data.entries()]);}
 snapshot(){return new Map(this.data);}
 restore(s:Map<string,string>){this.data=new Map(s);}
}
