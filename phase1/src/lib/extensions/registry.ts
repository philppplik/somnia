import {validateManifest} from './manifest';
import type {ExtensionManifest} from './types';
const notify=()=>window.dispatchEvent(new Event('somnia:extensions-changed'));
const KEY='somnia.extensions.v1';
export function loadExtensions():ExtensionManifest[]{try{const raw=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(raw)?raw.flatMap(x=>{const r=validateManifest(x);return r.ok?[r.manifest]:[];}):[];}catch{return[];}}
export function installExtension(text:string,options:{disabled?:boolean}={}):{ok:true;manifest:ExtensionManifest}|{ok:false;errors:string[]}{
 let json:unknown;try{json=JSON.parse(text);}catch{return{ok:false,errors:['Not valid JSON.']};}
 const r=validateManifest(json);if(!r.ok)return r;
 const old=loadExtensions().find(x=>x.id===r.manifest.id);
 // F5: a local reinstall with the same id silently replaced the extension while keeping the enabled
 // flag. If the new build asks for permissions the old one did not have, install it disabled so the
 // user re-enables it consciously with the new permission list in view.
 const added=old?r.manifest.permissions.filter(p=>!old.permissions.includes(p)):[];
 const next=loadExtensions().filter(x=>x.id!==r.manifest.id).concat(r.manifest);if(options.disabled||added.length)localStorage.setItem(OFF,JSON.stringify(enabledIds().filter(id=>id!==r.manifest.id)));localStorage.setItem(KEY,JSON.stringify(next));notify();return r;}
export function removeExtension(id:string){localStorage.setItem(KEY,JSON.stringify(loadExtensions().filter(x=>x.id!==id)));localStorage.setItem('somnia.extensions.enabled.v1',JSON.stringify(enabledIds().filter(x=>x!==id)));notify();}
const OFF='somnia.extensions.enabled.v1';
/** Extensions are off until the user switches them on (ADR-003). Only ids in this list run. */
export function enabledIds():string[]{try{const raw=JSON.parse(localStorage.getItem(OFF)||'[]');return Array.isArray(raw)?raw.filter((x):x is string=>typeof x==='string'):[];}catch{return[];}}
export function setExtensionEnabled(id:string,on:boolean){const next=enabledIds().filter(x=>x!==id);if(on)next.push(id);localStorage.setItem(OFF,JSON.stringify(next));notify();}
export const loadActiveExtensions=()=>{const on=enabledIds();return loadExtensions().filter(x=>on.includes(x.id)).map(effectiveManifest);};
const REV='somnia.extensions.revoked.v1';
/** Permissions the user switched off after install, per extension id. Revoked permissions are removed from the manifest before it runs. */
export function revokedPermissions():Record<string,string[]>{try{const v=JSON.parse(localStorage.getItem(REV)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return{};}}
export function setPermissionRevoked(id:string,permission:string,revoked:boolean){const all=revokedPermissions();const cur=(all[id]||[]).filter(p=>p!==permission);if(revoked)cur.push(permission);all[id]=cur;localStorage.setItem(REV,JSON.stringify(all));notify();}
export const effectiveManifest=(m:ExtensionManifest):ExtensionManifest=>{const r=revokedPermissions()[m.id]||[];return r.length?{...m,permissions:m.permissions.filter(p=>!r.includes(p))}:m;};
