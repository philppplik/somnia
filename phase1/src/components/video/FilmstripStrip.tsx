import {useEffect,useId,useRef,useState} from 'react';
import {layoutStrip} from '../../lib/video/filmstrip-model';
import type {FilmstripController} from '../../lib/video/filmstrip-controller';
import {useT} from '../../lib/useT';
interface Props{controller:FilmstripController;source:string;in_s:number;out_s:number;name:string;className?:string}
/**
 * Thumbnail strip for one timeline clip. Fills its (relatively positioned) parent. The canvas is never cleared before a redraw
 * has its tiles, and a missing tile is painted with the nearest cached frame, so loading, trimming and resizing do not flicker.
 */
export function FilmstripStrip({controller,source,in_s,out_s,name,className}:Props){
 const {t}=useT();
 const ref=useRef<HTMLCanvasElement>(null);
 const owner=useId();
 const [box,setBox]=useState({w:0,h:0});
 const [tick,setTick]=useState(0);
 useEffect(()=>{
  const el=ref.current?.parentElement;if(!el)return;
  const ro=new ResizeObserver(()=>setBox({w:Math.round(el.clientWidth),h:Math.round(el.clientHeight)}));
  ro.observe(el);setBox({w:Math.round(el.clientWidth),h:Math.round(el.clientHeight)});
  return()=>ro.disconnect();
 },[]);
 useEffect(()=>{
  let raf=0;
  const off=controller.subscribe(()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;setTick(n=>n+1);});});
  return()=>{off();if(raf)cancelAnimationFrame(raf);};
 },[controller]);
 useEffect(()=>()=>controller.release(owner),[controller,owner]);
 useEffect(()=>{
  const canvas=ref.current;if(!canvas||box.w<1||box.h<1)return;
  const info=controller.info(source);
  if(!info){controller.want(owner,[]);return;}
  const layout=layoutStrip({widthPx:box.w,heightPx:box.h,aspect:info.width/Math.max(1,info.height),in_s,out_s,duration:info.duration});
  controller.want(owner,layout.tiles.map(tile=>({source,tile,height:layout.tileHeight})));
  const dpr=Math.min(2,window.devicePixelRatio||1);
  const W=Math.round(box.w*dpr),H=Math.round(box.h*dpr);
  if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.clearRect(0,0,W,H);
  for(const tile of layout.tiles){
   const th=controller.get(source,tile,layout.tileHeight)??controller.nearest(source,tile.time);
   if(!th)continue;
   const full=layout.tileWidth;
   ctx.drawImage(th as unknown as CanvasImageSource,0,0,th.width*(tile.width/full),th.height,Math.round(tile.x*dpr),0,Math.round(tile.width*dpr),H);
  }
 },[controller,source,in_s,out_s,box.w,box.h,tick,owner]);
 const state=controller.state(source);
 return <canvas ref={ref} className={className??'absolute inset-0 h-full w-full'} style={{width:'100%',height:'100%'}} role="img"
  aria-label={t('video.filmstripAria',{name})} aria-busy={state==='opening'||undefined} data-testid="video-filmstrip" data-state={state}/>;
}
