export interface StudioSnapshot{version:1;studio:'code';name:string;files:Record<string,string>;activeFile:string;locale:string}
export const MAX_SNAPSHOT_BYTES=8_000_000;
export function validateSnapshot(value:unknown):StudioSnapshot{
 if(!value||typeof value!=='object')throw Error('Invalid handoff');const s=value as StudioSnapshot;
 if(s.version!==1||s.studio!=='code'||typeof s.name!=='string'||s.name.length>200||typeof s.locale!=='string'||s.locale.length>20||!s.files||typeof s.files!=='object'||Array.isArray(s.files))throw Error('Invalid handoff');
 const files=Object.entries(s.files);if(!files.length||files.length>1000)throw Error('Invalid files');
 for(const [name,text] of files)if(!name||name.length>1024||name.startsWith('/')||name.includes('\\')||name.split('/').some(p=>!p||p==='.'||p==='..')||typeof text!=='string')throw Error('Invalid file');
 if(!Object.hasOwn(s.files,s.activeFile)||new TextEncoder().encode(JSON.stringify(s)).length>MAX_SNAPSHOT_BYTES)throw Error('Invalid handoff size or active file');
 return s;
}
