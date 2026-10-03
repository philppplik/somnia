import {validateManifest} from './manifest';
import type {ExtensionManifest} from './types';
const KEY='somnia.extensions.v1';
export function loadExtensions():ExtensionManifest[]{try{const raw=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(raw)?raw.flatMap(x=>{const r=validateManifest(x);return r.ok?[r.manifest]:[];}):[];}catch{return[];}}
export function installExtension(text:string):{ok:true;manifest:ExtensionManifest}|{ok:false;errors:string[]}{
 let json:unknown;try{json=JSON.parse(text);}catch{return{ok:false,errors:['Not valid JSON.']};}
 const r=validateManifest(json);if(!r.ok)return r;
 const next=loadExtensions().filter(x=>x.id!==r.manifest.id).concat(r.manifest);localStorage.setItem(KEY,JSON.stringify(next));return r;}
export function removeExtension(id:string){localStorage.setItem(KEY,JSON.stringify(loadExtensions().filter(x=>x.id!==id)));}
