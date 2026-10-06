import {invoke, isTauri} from '@tauri-apps/api/core';
export type WindowBackground='solid'|'glass';
export interface BackgroundRequest {mode:WindowBackground;dark:boolean;highContrast:boolean}
export type BackgroundPort=(glass:boolean,dark:boolean)=>Promise<boolean>;
/** Only show transparent CSS after the native compositor confirms the effect.
 * Serialize native writes: fast theme/undo changes must not leave an old effect behind. */
export function createBackgroundController(port:BackgroundPort,root:HTMLElement){
 let queue=Promise.resolve();let revision=0;
 return (request:BackgroundRequest):Promise<void>=>{
  const current=++revision;
  root.dataset.background='solid';
  queue=queue.catch(()=>{}).then(async()=>{
   let active=false;
   try{active=await port(request.mode==='glass'&&!request.highContrast,request.dark);}catch{/* Stay opaque on native failure. */}
   if(current===revision)root.dataset.background=active&&request.mode==='glass'&&!request.highContrast?'glass':'solid';
  });
  return queue;
 };
}
let apply:ReturnType<typeof createBackgroundController>|undefined;
export function applyWindowBackground(request:BackgroundRequest){
 apply??=createBackgroundController(async(glass,dark)=>isTauri()?invoke<boolean>('set_window_background',{glass,dark}):false,document.documentElement);
 return apply(request);
}
