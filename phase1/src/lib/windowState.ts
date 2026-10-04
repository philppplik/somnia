/** Desktop only: remember window size, position and maximised state between starts (localStorage, physical pixels). */
import {getCurrentWindow,PhysicalPosition,PhysicalSize} from '@tauri-apps/api/window';
const KEY='somnia.window.v1';
interface Saved{w:number;h:number;x:number;y:number;max:boolean}
export const parseSaved=(raw:string|null):Saved|null=>{try{const v=JSON.parse(raw??'null');if(!v||![v.w,v.h,v.x,v.y].every(Number.isFinite)||v.w<600||v.h<400||v.w>20000||v.h>20000)return null;return {w:v.w,h:v.h,x:v.x,y:v.y,max:!!v.max};}catch{return null;}};
/** Keep a restored window reachable if the monitor layout changed: its title bar must stay at least partly on the current screen. */
export const clampPosition=(s:Saved,screenW:number,screenH:number)=>({x:Math.min(Math.max(s.x,-s.w+120),screenW-120),y:Math.min(Math.max(s.y,0),screenH-80)});
export async function restoreWindowState(){
 const win=getCurrentWindow();const s=parseSaved(localStorage.getItem(KEY));
 if(s){const dpr=window.devicePixelRatio||1;const p=clampPosition(s,window.screen.width*dpr,window.screen.height*dpr);
  try{await win.setSize(new PhysicalSize(s.w,s.h));await win.setPosition(new PhysicalPosition(p.x,p.y));if(s.max)await win.maximize();}catch(e){console.error('window restore failed',e);}}
 let timer=0;
 const save=()=>{window.clearTimeout(timer);timer=window.setTimeout(async()=>{try{const max=await win.isMaximized();const prev=parseSaved(localStorage.getItem(KEY));
  if(max){localStorage.setItem(KEY,JSON.stringify({...(prev??{w:1440,h:900,x:80,y:60}),max:true}));return;}
  const size=await win.outerSize(),pos=await win.outerPosition();localStorage.setItem(KEY,JSON.stringify({w:size.width,h:size.height,x:pos.x,y:pos.y,max:false}));}catch{/* window closing */}},500);};
 await win.onResized(save);await win.onMoved(save);
}
