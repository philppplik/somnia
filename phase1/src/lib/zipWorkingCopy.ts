import {unzipSync} from 'fflate';
import {decodeFileBytes} from './textEncoding';
import type {WebFsOptions} from './webFsPort';
/** Firefox/Safari fallback (ADR-002): no folder access, so a ZIP is unpacked into an in-memory directory that the web port treats like a folder. Nothing reaches disk until the user exports a ZIP. */
class MemFile{kind='file' as const;constructor(public text=''){}
 async getFile(){const t=this.text;return{text:async()=>t,arrayBuffer:async()=>new TextEncoder().encode(t).buffer};}
 async createWritable(){let buf='';return{write:async(v:string)=>{buf=String(v);},close:async()=>{this.text=buf;}};}}
export class MemDir{kind='directory' as const;items=new Map<string,MemDir|MemFile>();constructor(public name:string){}
 async getDirectoryHandle(n:string,o?:{create?:boolean}){let d=this.items.get(n);if(!d){if(!o?.create)throw new DOMException('missing','NotFoundError');d=new MemDir(n);this.items.set(n,d);}if(!(d instanceof MemDir))throw new DOMException('not a directory','TypeMismatchError');return d;}
 async getFileHandle(n:string,o?:{create?:boolean}){let f=this.items.get(n);if(!f){if(!o?.create)throw new DOMException('missing','NotFoundError');f=new MemFile();this.items.set(n,f);}if(!(f instanceof MemFile))throw new DOMException('not a file','TypeMismatchError');return f;}
 async *entries(){for(const e of this.items)yield e;}}
const MAX_BYTES=20*1024*1024;
/** Unpacks ZIP bytes into a memory directory. Rejects unsafe paths, binary-looking entries are skipped (the editor is text-only). */
export function dirFromZip(bytes:Uint8Array,name:string):MemDir{
 const root=new MemDir(name);let total=0;
 const entries=unzipSync(bytes);
 for(const [path,data] of Object.entries(entries)){
  if(path.endsWith('/'))continue;
  const parts=path.split('/');if(path.startsWith('/')||parts.some(p=>p===''||p==='.'||p==='..'||p.includes('\\')))throw Error(`Unsafe path in ZIP: ${path}`);
  total+=data.length;if(total>MAX_BYTES)throw Error('ZIP is larger than 20 MB. Use a smaller project.');
  if(data.includes(0))continue;
  let dir=root;for(const p of parts.slice(0,-1)){let next=dir.items.get(p);if(!(next instanceof MemDir)){next=new MemDir(p);dir.items.set(p,next);}dir=next;}
  dir.items.set(parts[parts.length-1],new MemFile(decodeFileBytes(path,data).text));
 }
 return root;
}
export function pickZip():Promise<File|null>{return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept='.zip,application/zip';input.onchange=()=>resolve(input.files?.[0]??null);input.oncancel=()=>resolve(null);input.click();});}
export function zipWebFsOptions():WebFsOptions{
 return{pickDirectory:async()=>{const file=await pickZip();if(!file)return null;return dirFromZip(new Uint8Array(await file.arrayBuffer()),file.name.replace(/\.zip$/i,'')||'project') as unknown as FileSystemDirectoryHandle;},
  handles:{get:async()=>undefined,put:async()=>{}},volatile:true,connectNotice:'Working copy in this browser tab (ZIP import). Ctrl+S saves into the tab only. Use Export source ZIP to keep your changes.'} as WebFsOptions;
}
