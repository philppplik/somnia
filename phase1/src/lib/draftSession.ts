import {saveProjectBackup} from './projectBackups';
/** Draft restore for the memory-only starter project: unsaved work survives a crash or accidental reload. Stored in localStorage on this device only; kept until you reset to the starter project; only written while the project is memory-only. */
const KEY='somnia.draft.v1',MAX_BYTES=2_000_000;
export interface Draft{files:Record<string,string>;activeFile:string;openFiles:string[];savedAt:string}
export function readDraft():Draft|null{try{const x=JSON.parse(localStorage.getItem(KEY)||'null');if(!x||typeof x!=='object'||!x.files||typeof x.files!=='object')return null;
 const files:Record<string,string>={};for(const [k,v] of Object.entries(x.files))if(typeof v==='string')files[k]=v;if(!Object.keys(files).length)return null;
 return{files,activeFile:typeof x.activeFile==='string'?x.activeFile:'',openFiles:Array.isArray(x.openFiles)?x.openFiles.filter((f:unknown):f is string=>typeof f==='string'):[],savedAt:typeof x.savedAt==='string'?x.savedAt:''};}catch{return null;}}
export function saveDraft(d:Omit<Draft,'savedAt'>):boolean{try{const text=JSON.stringify({...d,savedAt:new Date().toISOString()});if(text.length>MAX_BYTES)return false;localStorage.setItem(KEY,text);saveProjectBackup(d.files,'Local recovery draft');return true;}catch{return false;}}
export function clearDraft(){try{localStorage.removeItem(KEY);}catch{/* storage unavailable */}}
