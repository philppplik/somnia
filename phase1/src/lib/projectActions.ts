/** Project level actions that do not need a disk port: open text files, new file, close an in-memory project. */
import {EditorProject} from '@somnia/editor-core';
import {applyOperations,closeCore,connectEditorProject,getState,openFileTab,patchState} from '../store/appStore';
import {clearDraft} from './draftSession';
import {starterFor} from './fileOps';
export const TEXT_FILE=/\.(html?|css|js|json|svg|txt|md)$/i;
const MAX_BYTES=2_000_000;
export interface IncomingFile{name:string;text:string}
const unique=(name:string,taken:string[])=>{const set=new Set(taken.map(f=>f.toLowerCase()));if(!set.has(name.toLowerCase()))return name;const m=/^(.*?)(\.[^./]+)?$/.exec(name)!;for(let i=2;i<1000;i++){const c=`${m[1]}-${i}${m[2]??''}`;if(!set.has(c.toLowerCase()))return c;}return name;};
const safeName=(n:string)=>n.replace(/[\\/:*?"<>|]/g,'_').replace(/^\.+/,'')||'file.txt';
/** Adds text files to the open project, or starts a new in-memory project from them when none is open. Returns the names that were added. */
export function addTextFiles(incoming:IncomingFile[]):string[]{
 const usable=incoming.filter(f=>TEXT_FILE.test(f.name)&&f.text.length<=MAX_BYTES);
 const skipped=incoming.length-usable.length;
 if(!usable.length){patchState({notice:'Somnia opens .html, .css, .js, .json, .svg, .txt and .md files up to 2 MB.'});return [];}
 const st=getState();const added:string[]=[];
 if(!st.coreConnected){const files:Record<string,string>={};for(const f of usable){const n=unique(safeName(f.name),Object.keys(files));files[n]=f.text;added.push(n);}
  connectEditorProject(new EditorProject(files),{name:added.length===1?added[0]:'Untitled project',alreadySaved:false});openFileTab(added.find(n=>/\.html?$/i.test(n))??added[0]);}
 else{const names=Object.keys(st.files);const ops=usable.map(f=>{const n=unique(safeName(f.name),names.concat(added));added.push(n);return {type:'createFile' as const,file:n,text:f.text};});
  applyOperations(ops);openFileTab(added[0]);}
 patchState({notice:`Opened ${added.join(', ')}${skipped?` (${skipped} unsupported file${skipped===1?'':'s'} skipped)`:''}.`});return added;}
export async function readFiles(list:FileList|File[]):Promise<IncomingFile[]>{return Promise.all([...list].map(async f=>({name:f.name,text:f.size<=MAX_BYTES?await f.text():''})));}
/** Open File: pick one or more text files with the system file dialog. */
export function openFileDialog(){return new Promise<void>(resolve=>{const input=document.createElement('input');input.type='file';input.multiple=true;input.accept='.html,.htm,.css,.js,.json,.svg,.txt,.md,text/*';
 input.onchange=async()=>{if(input.files?.length)addTextFiles(await readFiles(input.files));resolve();};input.oncancel=()=>resolve();input.click();});}
/** New file: a blank HTML page as the first file of a new in-memory project, or a new file in the open project. */
export function newBlankFile(){const st=getState();if(st.coreConnected){const n=unique('untitled.html',Object.keys(st.files));applyOperations([{type:'createFile',file:n,text:starterFor('x.html')}]);openFileTab(n);return;}
 addTextFiles([{name:'index.html',text:starterFor('index.html')}]);}
/** Close an in-memory project (Close Project for disk projects goes through the file adapter). */
export function closeMemoryProject(){clearDraft();closeCore();}
