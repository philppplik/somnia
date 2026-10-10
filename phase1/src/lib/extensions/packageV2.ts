import {inflateSync} from 'fflate';
import {diagnostic,isSafePackagePath,MANIFEST_V2_FILENAME,parseManifestV2,type ExtensionDiagnostic,type ManifestValidationOptions,type ManifestV2} from './manifestV2';
export const PACKAGE_V2_LIMITS = Object.freeze({compressed:25*1024*1024,expanded:100*1024*1024,files:5000,entry:20*1024*1024});
export interface VerifiedPackageV2 {manifest:ManifestV2; files:Readonly<Record<string,Uint8Array>>}
export type PackageResultV2 = {ok:true; package:VerifiedPackageV2} | {ok:false; errors:ExtensionDiagnostic[]};
const fail=(code:`SOM-EXT-${string}`,path:string,message:string):PackageResultV2=>({ok:false,errors:[diagnostic(code,path,message)]});
const escape=(s:string)=>s.replace(/~/g,'~0').replace(/\//g,'~1');
function forbiddenFileMagic(bytes:Uint8Array):boolean {
  const magic=(...prefix:number[])=>prefix.every((b,i)=>bytes[i]===b);
  return magic(0x50,0x4b,3,4)||magic(0x50,0x4b,5,6)||magic(0x1f,0x8b)||
    magic(0x37,0x7a,0xbc,0xaf,0x27,0x1c)||magic(0x52,0x61,0x72,0x21)||magic(0x4d,0x5a)||
    magic(0x7f,0x45,0x4c,0x46)||magic(0xcf,0xfa,0xed,0xfe)||magic(0xfe,0xed,0xfa,0xcf)||
    (bytes.length>262 && new TextDecoder().decode(bytes.subarray(257,262))==='ustar');
}
function fileBudget(path:string,m:ManifestV2):number {
  if(path===MANIFEST_V2_FILENAME) return 256*1024;
  if(m.runtime.entry===path) return PACKAGE_V2_LIMITS.entry;
  if(m.contributes.panels?.some(c=>c.path===path)) return 256*1024;
  if(m.contributes.themes?.some(c=>c.path===path)) return 64*1024;
  if(m.contributes.snippets?.some(c=>c.path===path)) return 32*1024;
  return PACKAGE_V2_LIMITS.expanded;
}
/** In-memory verified inventory, not an extractor. Caller must reject symlinks before folder reads. */
export function parsePackageFilesV2(files:Readonly<Record<string,Uint8Array>>,options:ManifestValidationOptions={}):PackageResultV2 {
  const errors:ExtensionDiagnostic[]=[];
  const names=Object.keys(files); let total=0; const seen=new Set<string>();
  if(names.length>PACKAGE_V2_LIMITS.files) return fail('SOM-EXT-007','/files','Package exceeds 5,000 files.');
  for(const name of names) {
    const p=`/files/${escape(name)}`; const folded=name.normalize('NFC').toLowerCase();
    if(!isSafePackagePath(name)) errors.push(diagnostic('SOM-EXT-005',p,'Unsafe package inventory path.'));
    if(seen.has(folded)) errors.push(diagnostic('SOM-EXT-005',p,'Case or Unicode-colliding inventory path.')); seen.add(folded);
    if(/\.(?:zip|somniax|tar|gz|7z|rar|exe|dll|so|dylib|cwasm)$/i.test(name)) errors.push(diagnostic('SOM-EXT-008',p,'Nested archives and native executables are not accepted in SDK v2.'));
    if(!(files[name] instanceof Uint8Array)) errors.push(diagnostic('SOM-EXT-008',p,'Inventory entry must contain verified bytes.'));
    else {
      total+=files[name].byteLength;
      if(forbiddenFileMagic(files[name])) errors.push(diagnostic('SOM-EXT-008',p,'Archive or native executable content is not accepted.'));
    }
  }
  for(const name of names) {
    const parts=name.normalize('NFC').toLowerCase().split('/');
    for(let i=1;i<parts.length;i++) if(seen.has(parts.slice(0,i).join('/'))) errors.push(diagnostic('SOM-EXT-005',`/files/${escape(name)}`,'File conflicts with a parent directory.'));
  }
  if(total>PACKAGE_V2_LIMITS.expanded) errors.push(diagnostic('SOM-EXT-007','/files','Package exceeds 100 MiB expanded.'));
  if(errors.length) return {ok:false,errors};
  if(!Object.hasOwn(files,MANIFEST_V2_FILENAME)) return fail('SOM-EXT-006','',`Package must contain ${MANIFEST_V2_FILENAME} at its root.`);
  if(names.some(n=>n!==MANIFEST_V2_FILENAME && n.endsWith('/'+MANIFEST_V2_FILENAME))) return fail('SOM-EXT-006','', 'Package contains multiple manifests.');
  const parsed=parseManifestV2(files[MANIFEST_V2_FILENAME],options); if(!parsed.ok) return parsed;
  const m=parsed.manifest;
  const references:{path:string;pointer:string}[]=[];
  if(m.runtime.entry) references.push({path:m.runtime.entry,pointer:'/runtime/entry'});
  if(m.icon) references.push({path:m.icon,pointer:'/icon'});
  if(m.license.startsWith('SEE LICENSE IN ')) references.push({path:m.license.slice(15),pointer:'/license'});
  for(const [family,items] of Object.entries(m.contributes)) for(const [i,c] of (items??[]).entries()) for(const key of ['path','icon'] as const) if(c[key]) references.push({path:c[key]!,pointer:`/contributes/${family}/${i}/${key}`});
  for(const ref of references) if(!Object.hasOwn(files,ref.path)) errors.push(diagnostic('SOM-EXT-006',ref.pointer,'Referenced file is missing from the verified inventory.'));
  for(const name of names) if(files[name].byteLength>fileBudget(name,m)) errors.push(diagnostic('SOM-EXT-007',`/files/${escape(name)}`,'Asset exceeds its package budget.'));
  if(m.runtime.type==='wasm' && !m.runtime.entry?.endsWith('.wasm')) errors.push(diagnostic('SOM-EXT-003','/runtime/entry','Wasm entry must be a .wasm file.'));
  if(m.runtime.type==='js' && !m.runtime.entry?.endsWith('.js')) errors.push(diagnostic('SOM-EXT-003','/runtime/entry','JS entry must be a bundled .js file.'));
  if(errors.length) return {ok:false,errors};
  // Copy so changes to the caller's buffers cannot alter the validated manifest/assets.
  const inventory:Record<string,Uint8Array>=Object.create(null);
  for(const name of names) inventory[name]=files[name].slice();
  return {ok:true,package:{manifest:m,files:Object.freeze(inventory)}};
}
interface ZipEntry {name:string; size:number; compressed:number; offset:number; data:number; crc:number; flags:number; method:number}
/** Strict central/local preflight happens before fflate allocates any expanded buffers. */
function inspectZip(bytes:Uint8Array):ZipEntry[] {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u16=(p:number)=>view.getUint16(p,true),u32=(p:number)=>view.getUint32(p,true);
  let end=-1;
  for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--) if(u32(p)===0x06054b50&&p+22+u16(p+20)===bytes.length) {end=p;break;}
  if(end<0||u16(end+4)!==0||u16(end+6)!==0||u16(end+8)!==u16(end+10)) throw Error('Invalid or multi-disk ZIP.');
  const count=u16(end+10),central=u32(end+16),centralSize=u32(end+12);
  if(count>PACKAGE_V2_LIMITS.files||central+centralSize!==end) throw Error('Invalid central directory or too many entries.');
  const result:ZipEntry[]=[]; const seen=new Set<string>(); let pos=central,total=0;
  const decoder=new TextDecoder('utf-8',{fatal:true});
  const intervals:{start:number;end:number}[]=[];
  for(let i=0;i<count;i++) {
    if(pos+46>end||u32(pos)!==0x02014b50) throw Error('Invalid central entry.');
    const flags=u16(pos+8),method=u16(pos+10),compressed=u32(pos+20),size=u32(pos+24),crc=u32(pos+16);
    const nameLength=u16(pos+28),extra=u16(pos+30),comment=u16(pos+32),offset=u32(pos+42),attrs=u32(pos+38);
    if(pos+46+nameLength+extra+comment>end||u16(pos+34)!==0||size===0xffffffff||compressed===0xffffffff||offset===0xffffffff) throw Error('ZIP64 and multi-disk are not supported.');
    const name=decoder.decode(bytes.subarray(pos+46,pos+46+nameLength));
    // Non-UTF8 names are accepted only in the unambiguous ASCII subset.
    if(!(flags&0x800)&&/[^\x00-\x7f]/.test(name)) throw Error('Ambiguous ZIP filename encoding.');
    if(flags&~0x808 || ![0,8].includes(method)) throw Error('Unsupported ZIP flags, encryption or compression.');
    const directory=name.endsWith('/'),path=directory?name.slice(0,-1):name;
    const mode=attrs>>>16,type=mode&0xf000;
    if((type && type!==(directory?0x4000:0x8000))||(!directory&&(mode&0o111))||(!directory&&(attrs&0x10))) throw Error('Symlink, special file or executable ZIP entry.');
    if(!isSafePackagePath(path)||path.split('/').some(p=>['__proto__','constructor','prototype'].includes(p))) throw Error('Unsafe ZIP path.');
    const folded=path.normalize('NFC').toLowerCase(); if(seen.has(folded)) throw Error('Duplicate or colliding ZIP name.'); seen.add(folded);
    if(offset+30>central||u32(offset)!==0x04034b50||u16(offset+6)!==flags||u16(offset+8)!==method) throw Error('Invalid local ZIP header.');
    const localNameLength=u16(offset+26),localExtra=u16(offset+28),data=offset+30+localNameLength+localExtra;
    if(decoder.decode(bytes.subarray(offset+30,offset+30+localNameLength))!==name||data+compressed>central) throw Error('Local and central names differ or overlap.');
    if(!(flags&8)&&(u32(offset+18)!==compressed||u32(offset+22)!==size||u32(offset+14)!==crc)) throw Error('Local sizes or CRC disagree.');
    if(directory && (size!==0||compressed!==0)) throw Error('Directory entry contains data.');
    intervals.push({start:offset,end:data+compressed});
    total+=size; if(total>PACKAGE_V2_LIMITS.expanded) throw Error('Expanded package budget exceeded.');
    result.push({name,size,compressed,offset,data,crc,flags,method});
    pos+=46+nameLength+extra+comment;
  }
  if(pos!==end) throw Error('Unexpected central directory contents.');
  intervals.sort((a,b)=>a.start-b.start); for(let i=1;i<intervals.length;i++) if(intervals[i].start<intervals[i-1].end) throw Error('Overlapping local entries.');
  return result;
}
function crc32(bytes:Uint8Array):number {
  let crc=0xffffffff; for(const byte of bytes) {crc^=byte; for(let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);} return (crc^0xffffffff)>>>0;
}
export function parsePackageZipV2(bytes:Uint8Array,options:ManifestValidationOptions={}):PackageResultV2 {
  if(bytes.byteLength>PACKAGE_V2_LIMITS.compressed) return fail('SOM-EXT-007','','Package exceeds 25 MiB compressed.');
  try {
    const entries=inspectZip(bytes);
    const files:Record<string,Uint8Array>=Object.create(null);
    for(const e of entries) {
      const packed=bytes.subarray(e.data,e.data+e.compressed);
      const content=e.method===0?packed.slice():inflateSync(packed,{out:new Uint8Array(e.size)});
      if(!content||content.byteLength!==e.size||crc32(content)!==e.crc) throw Error('Corrupted ZIP entry.');
      if(!e.name.endsWith('/')) files[e.name]=content;
    }
    return parsePackageFilesV2(files,options);
  } catch {return fail('SOM-EXT-008','','Invalid, unsafe, corrupted or over-budget .somniax archive.');}
}
