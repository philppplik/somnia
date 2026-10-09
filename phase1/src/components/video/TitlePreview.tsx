import {useEffect,useRef} from 'react';
import {drawTitleCard,type TitleClip} from '../../lib/video/titles';
/** Preview of a title card at local time `time`, drawn by the same code the export uses, so what you see is what renders. */
export function TitlePreview({clip,time,aspect=16/9,label}:{clip:TitleClip;time:number;aspect?:number;label:string}){
 const ref=useRef<HTMLCanvasElement>(null);
 const h=720,w=Math.round(h*(aspect>0?aspect:16/9));
 useEffect(()=>{
  const ctx=ref.current?.getContext('2d');if(!ctx)return;
  drawTitleCard(ctx,clip,w,h,time);
 },[clip,time,w]);
 return <canvas ref={ref} width={w} height={h} role="img" aria-label={label} className="max-h-full max-w-full" style={{aspectRatio:`${w}/${h}`}} data-testid="video-title-preview"/>;
}
