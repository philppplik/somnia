import {typographyCss} from './documentPrefs';
import {escapeTitle} from './workflowPrefs';
import {decodeFileBytes} from './textEncoding';
/** Project level actions that do not need a disk port: open text files, new file, close an in-memory project. */
import {EditorProject} from '@somnia/editor-core';
import {applyOperations,closeCore,connectEditorProject,getState,openFileTab,patchState} from '../store/appStore';
import {clearDraft} from './draftSession';
import {starterFor} from './fileOps';
import {MEDIA_ACCEPT,MEDIA_FILE,addMediaFile} from './media';
export const TEXT_FILE=/\.(html?|css|js|json|svg|txt|md|tex)$/i;
const MAX_BYTES=2_000_000;
export interface IncomingFile{name:string;text:string;blob?:Blob}
const unique=(name:string,taken:string[])=>{const set=new Set(taken.map(f=>f.toLowerCase()));if(!set.has(name.toLowerCase()))return name;const m=/^(.*?)(\.[^./]+)?$/.exec(name)!;for(let i=2;i<1000;i++){const c=`${m[1]}-${i}${m[2]??''}`;if(!set.has(c.toLowerCase()))return c;}return name;};
const safeName=(n:string)=>n.replace(/[\\/:*?"<>|]/g,'_').replace(/^\.+/,'')||'file.txt';
/** Adds text files to the open project, or starts a new in-memory project from them when none is open. Returns the names that were added. */
export function addTextFiles(incoming:IncomingFile[]):string[]{
 const media=incoming.filter(f=>f.blob&&MEDIA_FILE.test(f.name));incoming=incoming.filter(f=>!(f.blob&&MEDIA_FILE.test(f.name)));
 if(media.length){void addMediaFiles(media);if(!incoming.length)return [];}
 const usable=incoming.filter(f=>TEXT_FILE.test(f.name)&&f.text.length<=MAX_BYTES);
 const skipped=incoming.length-usable.length;
 if(!usable.length){patchState({notice:'Somnia opens .html, .css, .js, .json, .svg, .txt, .md, .tex, .png, .jpg, .webp, .gif, .avif, .bmp, .ico, .tga, .tiff, .qoi, .pnm, .pdf, .psd, .docx and .xlsx files (text up to 2 MB).'});return [];}
 const added=commitTextFiles(usable);
 patchState({notice:`Opened ${added.join(', ')}${skipped?` (${skipped} unsupported file${skipped===1?'':'s'} skipped)`:''}.`});return added;}
/** Commits already validated text files to the project (new in-memory project, or new files in the open one) and activates the first. No filtering, no notice: callers (addTextFiles, Smart Open) own validation and feedback.
 * `activate:false` leaves the active tab alone when a project already exists (a new in-memory project still needs an active file). */
export function commitTextFiles(usable:IncomingFile[],opts:{activate?:boolean}={}):string[]{
 const st=getState();const added:string[]=[];
 if(!st.coreConnected){const files:Record<string,string>={};for(const f of usable){const n=unique(safeName(f.name),Object.keys(files));files[n]=f.text;added.push(n);}
  connectEditorProject(new EditorProject(files),{name:added.length===1?added[0]:'Untitled project',alreadySaved:false});openFileTab(added.find(n=>/\.html?$/i.test(n))??added[0]);}
 else{const names=Object.keys(st.files);const ops=usable.map(f=>{const n=unique(safeName(f.name),names.concat(added));added.push(n);return {type:'createFile' as const,file:n,text:f.text};});
  applyOperations(ops);if(opts.activate!==false)openFileTab(added[0]);}
 return added;}
/** Adds PNG, JPEG and PDF files as preview tabs. Reports files that are too large or not what their name says. */
export async function addMediaFiles(files:IncomingFile[]):Promise<string[]>{const names:string[]=[],problems:string[]=[];for(const f of files){const r=await addMediaFile(f.blob!,f.name);if('error' in r)problems.push(r.error);else names.push(r.name);}
 patchState({notice:problems.length?problems.join(' '):`Previewing ${names.join(', ')}.`});return names;}
export async function readFiles(list:FileList|File[]):Promise<IncomingFile[]>{return Promise.all([...list].map(async f=>MEDIA_FILE.test(f.name)?{name:f.name,text:'',blob:f}:{name:f.name,text:f.size<=MAX_BYTES?decodeFileBytes(f.name,await f.arrayBuffer()).text:'',blob:f}));}
/** Smart Open entry (installed by studios/openIntake.ts, which depends on this module). Until installed, falls back to the text/media importer. */
let openIncomingHook:(files:IncomingFile[],opts?:import('./studios/openCoordinator').BatchOptions)=>Promise<unknown>=async files=>{addTextFiles(files);};
export const installOpenIncoming=(fn:(files:IncomingFile[],opts?:import('./studios/openCoordinator').BatchOptions)=>Promise<unknown>)=>{openIncomingHook=fn;};
export const openIncoming=(files:IncomingFile[],opts?:import('./studios/openCoordinator').BatchOptions)=>openIncomingHook(files,opts);
/** Open File: pick one or more text files with the system file dialog. */
export function openFileDialog(){return new Promise<void>(resolve=>{const input=document.createElement('input');input.type='file';input.multiple=true;input.accept='.html,.htm,.css,.js,.json,.svg,.txt,.md,.tex,text/*,'+MEDIA_ACCEPT;
 input.onchange=async()=>{if(input.files?.length)await openIncomingHook(await readFiles(input.files));resolve();};input.oncancel=()=>resolve();input.click();});}
/** Open image or PDF: works the same in the browser and the desktop app (system file dialog, read-only preview). */
export function openMediaDialog(){return new Promise<void>(resolve=>{const input=document.createElement('input');input.type='file';input.multiple=true;input.accept=MEDIA_ACCEPT;
 input.onchange=async()=>{if(input.files?.length)await addMediaFiles([...input.files].map(f=>({name:f.name,text:'',blob:f})));resolve();};input.oncancel=()=>resolve();input.click();});}
/** New file: a blank HTML page as the first file of a new in-memory project, or a new file in the open project. */
export function newBlankFile(){const st=getState();const blank=starterFor('index.html').replace('<title>New page</title>','<title>'+escapeTitle(st.workflowPrefs.documentTitle)+'</title>').replace('</head>','  <style>\n'+typographyCss(st.documentPrefs)+'\n  </style>\n</head>');if(st.coreConnected){const n=unique('untitled.html',Object.keys(st.files));applyOperations([{type:'createFile',file:n,text:blank}]);openFileTab(n);return;}
 addTextFiles([{name:'index.html',text:blank}]);}
/** Close an in-memory project (Close Project for disk projects goes through the file adapter). */
export function closeMemoryProject(){if(closeCore())clearDraft();}
