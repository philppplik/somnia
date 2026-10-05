import {unzipSync,strFromU8} from 'fflate';
import {installExtension} from './registry';
import {validateManifest} from './manifest';
import type {ManifestResult} from './types';
/** Install an extension package: a .zip or a folder holding manifest.json (root or one top-level folder). `main` is a script path inside the package; its text becomes the manifest `code`. */
const MAX_TOTAL=2_000_000,MAX_FILES=200;
export type PackageResult=ReturnType<typeof installExtension>;
export function parsePackageFiles(files:Record<string,Uint8Array>):ManifestResult{
 const names=Object.keys(files).filter(n=>!n.endsWith('/')&&!n.startsWith('__MACOSX/'));
 if(names.length>MAX_FILES)return{ok:false,errors:['Package has more than 200 files.']};
 if(names.reduce((a,n)=>a+files[n].length,0)>MAX_TOTAL)return{ok:false,errors:['Package is larger than 2 MB.']};
 if(names.some(n=>n.split('/').some(p=>p==='..'||p==='.')||n.startsWith('/')||n.includes('\\')||n.includes(':')))return{ok:false,errors:['Package contains unsafe paths.']};
 const manifests=names.filter(n=>/(^|\/)(somnia-extension|manifest)\.json$/.test(n));
 if(manifests.length>1)return{ok:false,errors:['Package must contain exactly one manifest.']};
 const man=manifests[0];
 if(!man)return{ok:false,errors:['No somnia-extension.json (or manifest.json) found in the package.']};
 const base=man.slice(0,man.lastIndexOf("/")+1);
 if(base.split('/').filter(Boolean).length>1)return{ok:false,errors:['manifest.json must be at the root or in one top-level folder.']};
 let obj:any;try{obj=JSON.parse(strFromU8(files[man]));}catch{return{ok:false,errors:['manifest.json is not valid JSON.']};}
 if(obj&&typeof obj==='object'&&typeof obj.main==='string'&&typeof obj.code!=='string'){
  if(obj.main.includes('..')||obj.main.includes('\\')||obj.main.startsWith('/')||obj.main.includes(':'))return{ok:false,errors:['Unsafe main path.']};
  const key=base+obj.main.replace(/^\.\//,'');const f=files[key];
  if(!f)return{ok:false,errors:[`main file "${obj.main}" not found in the package.`]};
  obj={...obj,code:strFromU8(f)};delete obj.main;}
 return validateManifest(obj);}
export function installFromFiles(files:Record<string,Uint8Array>):PackageResult{const r=parsePackageFiles(files);return r.ok?installExtension(JSON.stringify(r.manifest)):r;}
export async function installFromZip(file:File):Promise<PackageResult>{
 if(file.size>MAX_TOTAL)return{ok:false,errors:['ZIP is larger than 2 MB.']};
 const r=parsePackageZip(new Uint8Array(await file.arrayBuffer()));return r.ok?installExtension(JSON.stringify(r.manifest)):r;}
export async function installFromFolder(list:FileList):Promise<PackageResult>{
 const files:Record<string,Uint8Array>={};let total=0;
 for(const f of Array.from(list)){const path=(f as any).webkitRelativePath||f.name;total+=f.size;if(total>MAX_TOTAL)return{ok:false,errors:['Folder is larger than 2 MB.']};files[path]=new Uint8Array(await f.arrayBuffer());}
 return installFromFiles(files);}

/** Check central-directory sizes before allocating decompressed buffers. */
export function parsePackageZip(bytes:Uint8Array):ManifestResult{
 if(bytes.length>MAX_TOTAL)return{ok:false,errors:['ZIP is larger than 2 MB.']};
 try{let total=0,count=0;const files=unzipSync(bytes,{filter:entry=>{
  total+=entry.originalSize;count++;if(total>MAX_TOTAL||count>MAX_FILES)throw new Error('Package exceeds the 2 MB / 200 file limit.');return true;
 }});return parsePackageFiles(files);}catch{return{ok:false,errors:['Invalid ZIP or package exceeds the 2 MB / 200 file limit.']};}
}
