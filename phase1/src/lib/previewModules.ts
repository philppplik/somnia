import {resolveProjectPath} from './previewResources';
/**
 * ES module support for the live preview (W7). The preview runs in a sandbox="allow-scripts" iframe with an opaque origin: relative
 * imports have nothing to resolve against and blob: URLs do not load there. So every relative import (static, re-export, dynamic with a
 * string literal) is resolved against the project files and replaced by a `data:text/javascript;base64,...` URL of the imported module,
 * whose own imports were rewritten first. Equal content gives an equal URL, so a module shared by two importers stays one instance.
 * Import cycles cannot be expressed with data: URLs; the edge that closes a cycle points at an empty module and is reported.
 */
export interface ModuleState{cycles:string[];urls:Map<string,string>}
export const newModuleState=():ModuleState=>({cycles:[],urls:new Map()});
const mask=(js:string)=>js.replace(/\/\*[\s\S]*?\*\/|(^|[^:'"`\\])\/\/[^\n]*/g,(m,pre?:string)=>{const keep=pre??'';return keep+m.slice(keep.length).replace(/[^\n]/g,' ');});
const STATIC=/(?:\bimport\s*(?:[\w*${}\s,]+?\s*from\s*)?|\bexport\s*(?:[\w*${}\s,]+?)\s*from\s*)(?:"([^"]+)"|'([^']+)')/g;
const DYNAMIC=/\bimport\s*\(\s*(?:"([^"]+)"|'([^']+)')\s*\)/g;
/** Relative import specifiers with their offsets in the (unchanged) source text. Bare and absolute-URL specifiers are left alone. */
export function findImportSpecs(js:string):Array<{spec:string;start:number;end:number}>{
 const text=mask(js),out:Array<{spec:string;start:number;end:number}>=[];
 for(const re of [STATIC,DYNAMIC])for(const m of text.matchAll(re)){const spec=m[1]??m[2];if(!spec||!/^\.{0,2}\//.test(spec))continue;const start=m.index!+m[0].lastIndexOf(spec);out.push({spec,start,end:start+spec.length});}
 return out.sort((a,b)=>a.start-b.start);
}
export function toJsDataUrl(js:string):string{const bytes=new TextEncoder().encode(js);let bin='';for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return 'data:text/javascript;base64,'+btoa(bin);}
const STUB=toJsDataUrl('export {};');
/** Rewrites the relative imports of `js` (living at project path `from`) to data: URLs. `chain` holds the modules currently being linked, for cycle detection. */
export function rewriteImports(files:Readonly<Record<string,string>>,from:string,js:string,state:ModuleState,chain:string[]=[from]):string{
 const specs=findImportSpecs(js);if(!specs.length)return js;
 let out='',at=0;
 for(const s of specs){
  const target=resolveProjectPath(from,s.spec);const url=target?moduleUrl(files,target,state,chain):null;
  if(url){out+=js.slice(at,s.start)+url;at=s.end;}
 }
 return out+js.slice(at);
}
function moduleUrl(files:Readonly<Record<string,string>>,path:string,state:ModuleState,chain:string[]):string|null{
 const at=chain.indexOf(path);
 if(at>=0){const c=[...chain.slice(at),path].join(' → ');if(!state.cycles.includes(c))state.cycles.push(c);return STUB;}
 const src=files[path];if(src==null)return null;
 const known=state.urls.get(path);if(known)return known;
 const body=rewriteImports(files,path,src.replace(/\r\n?/g,'\n'),state,[...chain,path]);
 const url=toJsDataUrl(body+'\n//# sourceURL=somnia-preview://module/'+encodeURIComponent(path));state.urls.set(path,url);return url;
}
