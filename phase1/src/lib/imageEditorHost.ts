/** File access for the image editor. Desktop: one-time native grants and raw bytes. Web: file input and download. */
import {downloadImage} from './image-editor/export';
export type HostInvoke=<T>(command:string,args?:unknown,options?:{headers?:Record<string,string>})=>Promise<T>;
export interface PickedImage{blob:Blob;name:string}
export interface ImageEditorHost{
 pick():Promise<PickedImage|null>;
 /** Resolves false when the user cancelled the save dialog. */
 save(blob:Blob,suggestedName:string):Promise<boolean>;
}
interface Grant{token:string;name:string;size:number}
export function nativeImageHost(invoke:HostInvoke):ImageEditorHost{
 return {
  async pick(){
   const grant=await invoke<Grant|null>('image_pick');if(!grant)return null;
   const bytes=await invoke<ArrayBuffer>('image_read',{token:grant.token});
   return {blob:new Blob([bytes]),name:grant.name};},
  async save(blob,suggestedName){
   const grant=await invoke<Grant|null>('image_save_pick',{suggestedName});if(!grant)return false;
   await invoke('image_save_write',new Uint8Array(await blob.arrayBuffer()),{headers:{'x-somnia-token':grant.token}});
   return true;},
 };
}
export const IMAGE_ACCEPT='.png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml';
export function webImageHost():ImageEditorHost{
 return {
  pick:()=>new Promise(resolve=>{
   const input=document.createElement('input');input.type='file';input.accept=IMAGE_ACCEPT;
   input.onchange=()=>{const f=input.files?.[0];resolve(f?{blob:f,name:f.name}:null);};
   input.oncancel=()=>resolve(null);input.click();}),
  async save(blob,suggestedName){downloadImage(blob,suggestedName);return true;},
 };
}
export async function defaultImageHost():Promise<ImageEditorHost>{
 const core=await import('@tauri-apps/api/core');
 return core.isTauri()?nativeImageHost(core.invoke as HostInvoke):webImageHost();
}
/** "photo.jpg" + png -> "photo-edited.png" */
export function editedName(name:string,ext:string){const base=name.replace(/\.[^.\\/]+$/,'')||'image';return `${base}-edited.${ext}`;}
