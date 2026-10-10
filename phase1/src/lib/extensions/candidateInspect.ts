import {MANIFEST_V2_FILENAME,PACKAGE_V2_SUFFIX,type ExtensionDiagnostic,type ManifestV2,type ManifestValidationOptions} from './manifestV2';
import {parsePackageFilesV2,parsePackageZipV2} from './packageV2';
import {parsePackageFiles,parsePackageZip} from './packageInstall';
import {validateManifest} from './manifest';
import {securityOf} from './securityPolicy';
import {grantsFromManifest,locate,type CandidateState} from './popupModel';
import type {ExtensionManifest} from './types';

export interface InspectInput {manifestText:string; packageName?:string; bytes?:Uint8Array; files?:Record<string,Uint8Array>}
export interface InspectDeps {
  /** Installed version of this id in any lane, or null. */
  installedVersion(id:string):string|null;
  /** True when the verified blocklist matches this exact release. */
  blocked?(id:string,version:string):boolean;
  validation?:ManifestValidationOptions;
}
export type Staged=
 |{lane:'v2'; manifest:ManifestV2; files:Readonly<Record<string,Uint8Array>>; artifactHash:string; manifestHash:string; origin:string}
 |{lane:'legacy'; manifest:ExtensionManifest; artifactHash:string; manifestHash:string; origin:string};
export interface Inspection {state:CandidateState; staged?:Staged}

export async function sha256Hex(bytes:Uint8Array):Promise<string>{
 const d=await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>);
 return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,'0')).join('');
}
const enc=new TextEncoder();
/** Stable digest over a file inventory: sorted names with lengths, so reordering never changes it. */
export async function inventoryHash(files:Readonly<Record<string,Uint8Array>>):Promise<string>{
 const parts:Uint8Array[]=[];
 for(const name of Object.keys(files).sort()){parts.push(enc.encode(`${name}\0${files[name].byteLength}\0`),files[name]);}
 const total=parts.reduce((n,p)=>n+p.byteLength,0);const all=new Uint8Array(total);let o=0;for(const p of parts){all.set(p,o);o+=p.byteLength;}
 return sha256Hex(all);
}
type ErrCode=Extract<CandidateState,{kind:'error'}>['code'];
function v2Error(errors:readonly ExtensionDiagnostic[]):CandidateState{
 const e=errors[0];const msg=`${e?.message??''} ${e?.path??''}`;
 let code:ErrCode='malformed';
 if(/permission/i.test(msg))code='unknownPermission';
 else if(/engine|host version/i.test(msg))code='unsupportedApp';
 else if(/missing|not found|entry|declared file/i.test(msg))code='missingEntry';
 return {kind:'error',code,detail:e?`${e.code} ${e.path}`.trim():undefined};
}
const top=(files:Record<string,Uint8Array>)=>{
 const names=Object.keys(files).filter(n=>!n.endsWith('/')&&!n.startsWith('__MACOSX/'));
 const roots=new Set(names.map(n=>n.split('/')[0]));
 // A picked folder arrives as <folder>/<files>; strip that single prefix only when every entry shares it.
 if(roots.size===1&&names.every(n=>n.includes('/'))){const p=[...roots][0]+'/';return Object.fromEntries(names.map(n=>[n.slice(p.length),files[n]]));}
 return Object.fromEntries(names.map(n=>[n,files[n]]));
};

export async function inspectCandidate(input:InspectInput,deps:InspectDeps):Promise<Inspection>{
 const opts:ManifestValidationOptions={...deps.validation,lane:'local'};
 const name=input.packageName??'';
 const finish=async(staged:Staged):Promise<Inspection>=>{
  const m=staged.manifest;
  if(deps.blocked?.(m.id,m.version))return {state:{kind:'error',code:'blocked',detail:`${m.id}@${m.version}`}};
  if(deps.installedVersion(m.id)===m.version)return {state:{kind:'error',code:'duplicate',detail:m.id}};
  if(staged.lane==='v2'){
   const sec=securityOf(staged.manifest);
   return {staged,state:{kind:'ready',id:m.id,name:m.name,version:m.version,origin:staged.origin,engine:`API ${(m as ManifestV2).engines.api}`,verification:'no-signed-match',native:sec.tier==='B',grants:grantsFromManifest(staged.manifest,{})}};
  }
  const lm=staged.manifest;
  return {staged,state:{kind:'ready',id:lm.id,name:lm.name,version:lm.version,origin:staged.origin,engine:`API ${lm.apiVersion}`,verification:'no-signed-match',native:false,
   grants:lm.permissions.filter(p=>p==='project.read'||p==='project.write').map(p=>({id:p,key:p as 'project.read'|'project.write',control:'toggle' as const,granted:true}))}};
 };
 const fromV2=async(files:Readonly<Record<string,Uint8Array>>,artifactHash:string,origin:string):Promise<Inspection|{errors:ExtensionDiagnostic[]}>=>{
  const r=parsePackageFilesV2(files,opts);if(!r.ok)return {errors:r.errors};
  const mb=files[MANIFEST_V2_FILENAME];
  return finish({lane:'v2',manifest:r.package.manifest,files:r.package.files,artifactHash,manifestHash:await sha256Hex(mb),origin});
 };
 const fromLegacy=async(m:ExtensionManifest,artifactHash:string,manifestJson:string,origin:string)=>
  finish({lane:'legacy',manifest:m,artifactHash,manifestHash:await sha256Hex(enc.encode(manifestJson)),origin});

 try{
  if(input.bytes){
   const bytes=input.bytes;const isV2Name=name.endsWith(PACKAGE_V2_SUFFIX);
   if(!isV2Name&&!name.endsWith('.zip'))return {state:{kind:'error',code:'wrongType'}};
   const hash=await sha256Hex(bytes);
   const v2=parsePackageZipV2(bytes,opts);
   if(v2.ok)return await finish({lane:'v2',manifest:v2.package.manifest,files:v2.package.files,artifactHash:hash,manifestHash:await sha256Hex(v2.package.files[MANIFEST_V2_FILENAME]),origin:name});
   if(isV2Name)return {state:v2Error(v2.errors)};
   const v1=parsePackageZip(bytes);
   if(v1.ok)return await fromLegacy(v1.manifest,hash,JSON.stringify(v1.manifest),name);
   return {state:{kind:'error',code:/not found|No somnia/i.test(v1.errors[0]??'')?'missingEntry':'malformed',detail:v1.errors[0]}};
  }
  if(input.files){
   const files=top(input.files);const origin=name||'folder';
   if(files[MANIFEST_V2_FILENAME]){
    const r=await fromV2(files,await inventoryHash(files),origin);
    return 'errors' in r?{state:v2Error(r.errors)}:r;
   }
   const v1=parsePackageFiles(files);
   if(v1.ok)return await fromLegacy(v1.manifest,await inventoryHash(files),JSON.stringify(v1.manifest),origin);
   return {state:{kind:'error',code:/No somnia|not found/i.test(v1.errors[0]??'')?'missingEntry':'malformed',detail:v1.errors[0]}};
  }
  const text=input.manifestText.trim();if(!text)return {state:{kind:'empty'}};
  const origin=name||'Pasted manifest';
  if(text.startsWith('{')){
   let v:unknown;try{v=JSON.parse(text);}catch(e){return {state:{kind:'error',code:'malformed',...locate(e instanceof Error?e.message:'')}};}
   const r=validateManifest(v);
   if(!r.ok)return {state:{kind:'error',code:r.errors.some(e=>/permission/i.test(e))?'unknownPermission':'malformed',detail:r.errors[0]}};
   const bytes=enc.encode(text);
   return await fromLegacy(r.manifest,await sha256Hex(bytes),text,origin);
  }
  // Pasted TOML is a complete package only when it references no files.
  const bytes=enc.encode(text);
  const r=await fromV2({[MANIFEST_V2_FILENAME]:bytes},await sha256Hex(bytes),origin);
  if('errors' in r){
   const s=v2Error(r.errors);
   return {state:s.kind==='error'&&s.code==='missingEntry'?{kind:'error',code:'missingEntry',detail:s.detail}:s};
  }
  return r;
 }catch{return {state:{kind:'error',code:'failed'}};}
}
