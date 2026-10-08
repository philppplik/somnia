/** Versions vocabulary. Simple mode never shows Git words; Advanced adds the Git term next to the plain one. */
const KEY='somnia.versions.advanced.v1';
const listeners=new Set<()=>void>();
let advanced=false;
try{advanced=typeof localStorage!=='undefined'&&localStorage.getItem(KEY)==='1';}catch{/* storage unavailable */}
export const getAdvanced=()=>advanced;
export const subscribeAdvanced=(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};};
export function setAdvanced(v:boolean){advanced=v;try{localStorage.setItem(KEY,v?'1':'0');}catch{/* storage unavailable */}listeners.forEach(f=>f());}
/** "Save version" -> "Save version (commit)" when advanced. */
export const withGit=(plain:string,git:string,adv:boolean)=>adv?`${plain} (${git})`:plain;
