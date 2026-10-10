import {MANIFEST_V2_FILENAME,validateManifestV2,type ManifestV2} from './manifestV2';
import {parsePackageFilesV2} from './packageV2';

/** Verified v2 package bytes of approved installs. Consent state lives in the PermissionBroker; this only keeps the bytes. */
export const V2_PACKAGES_KEY='somnia.extensions.v2.packages.v1';
export interface StoredPackage {manifest:ManifestV2; artifactHash:string; manifestHash:string; origin:string; installedAt:string; files:Record<string,string>}
export interface PackageStorage {getItem(key:string):string|null; setItem(key:string,value:string):void}
const b64=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);};
const unb64=(text:string)=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));

export class V2PackageStore {
  constructor(private readonly storage:PackageStorage,private readonly now:()=>number=Date.now){}
  private read():Record<string,StoredPackage> {
    try{
      const raw=this.storage.getItem(V2_PACKAGES_KEY);if(!raw)return Object.create(null);
      const v=JSON.parse(raw);if(!v||typeof v!=='object'||Array.isArray(v))return Object.create(null);
      const out:Record<string,StoredPackage>=Object.create(null);
      for(const [id,p] of Object.entries(v as Record<string,StoredPackage>)){
        // Stored data is re-validated, never trusted as already verified.
        const m=p&&typeof p==='object'?validateManifestV2(p.manifest,{lane:'experimental'}):null;
        if(p&&typeof p.artifactHash==='string'&&/^[a-f0-9]{64}$/.test(p.artifactHash)&&p.files&&typeof p.files==='object'){
          const r=m&&m.ok?m:null; if(r&&r.manifest.id===id){out[id]={...p,manifest:r.manifest};}
        }
      }
      return out;
    }catch{return Object.create(null);}
  }
  private write(all:Record<string,StoredPackage>):void{this.storage.setItem(V2_PACKAGES_KEY,JSON.stringify(all));}
  list():StoredPackage[]{return Object.values(this.read());}
  get(id:string):StoredPackage|null{return this.read()[id]??null;}
  /** Throws when the storage quota is exceeded; the caller must not approve in that case. */
  put(manifest:ManifestV2,files:Readonly<Record<string,Uint8Array>>,meta:{artifactHash:string;manifestHash:string;origin:string}):()=>void {
    const all=this.read();const previous=all[manifest.id]??null;
    const encoded:Record<string,string>={};for(const [name,bytes] of Object.entries(files))encoded[name]=b64(bytes);
    all[manifest.id]={manifest,artifactHash:meta.artifactHash,manifestHash:meta.manifestHash,origin:meta.origin,installedAt:new Date(this.now()).toISOString(),files:encoded};
    this.write(all);
    return ()=>{const cur=this.read();if(previous)cur[manifest.id]=previous;else delete cur[manifest.id];try{this.write(cur);}catch{/* nothing more to do */}};
  }
  remove(id:string):void{const all=this.read();if(id in all){delete all[id];this.write(all);}}
  /** Re-parses stored bytes through the same verifier used at install time. */
  files(id:string):Record<string,Uint8Array>|null{
    const p=this.get(id);if(!p)return null;
    const files:Record<string,Uint8Array>=Object.create(null);for(const [n,t] of Object.entries(p.files))files[n]=unb64(t);
    const r=parsePackageFilesV2(files,{lane:'experimental'});return r.ok&&r.package.manifest.id===id?files:null;
  }
}
export {MANIFEST_V2_FILENAME};
