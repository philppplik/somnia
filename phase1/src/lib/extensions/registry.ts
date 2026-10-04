import {validateManifest} from './manifest';
import type {ExtensionManifest} from './types';
const notify=()=>window.dispatchEvent(new Event('somnia:extensions-changed'));
const KEY='somnia.extensions.v1';
export function loadExtensions():ExtensionManifest[]{try{const raw=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(raw)?raw.flatMap(x=>{const r=validateManifest(x);return r.ok?[r.manifest]:[];}):[];}catch{return[];}}
export function installExtension(text:string):{ok:true;manifest:ExtensionManifest}|{ok:false;errors:string[]}{
 let json:unknown;try{json=JSON.parse(text);}catch{return{ok:false,errors:['Not valid JSON.']};}
 const r=validateManifest(json);if(!r.ok)return r;
 const next=loadExtensions().filter(x=>x.id!==r.manifest.id).concat(r.manifest);localStorage.setItem(KEY,JSON.stringify(next));notify();return r;}
export function removeExtension(id:string){localStorage.setItem(KEY,JSON.stringify(loadExtensions().filter(x=>x.id!==id)));localStorage.setItem('somnia.extensions.enabled.v1',JSON.stringify(enabledIds().filter(x=>x!==id)));notify();}
const OFF='somnia.extensions.enabled.v1';
/** Extensions are off until the user switches them on (ADR-003). Only ids in this list run. */
export function enabledIds():string[]{try{const raw=JSON.parse(localStorage.getItem(OFF)||'[]');return Array.isArray(raw)?raw.filter((x):x is string=>typeof x==='string'):[];}catch{return[];}}
export function setExtensionEnabled(id:string,on:boolean){const next=enabledIds().filter(x=>x!==id);if(on)next.push(id);localStorage.setItem(OFF,JSON.stringify(next));notify();}
export const loadActiveExtensions=()=>{const on=enabledIds();return loadExtensions().filter(x=>on.includes(x.id));};
