/** Filmstrip model: pure bucket/tile math. Thumbnails are keyed by SOURCE time buckets, so trim and move never invalidate them. */

/** Bucket sizes in source seconds. A tile always snaps to the smallest step that is >= the seconds one tile covers. */
export const BUCKET_STEPS=[0.1,0.25,0.5,1,2,5,10,30,60,120,300] as const;
/** Tile heights (CSS px) a strip may request; the real request is this times the device pixel ratio, so cache keys stay few. */
export const TILE_HEIGHTS=[24,32,48,64,96] as const;
export const bucketStep=(secondsPerTile:number)=>BUCKET_STEPS.find(s=>s>=secondsPerTile)??BUCKET_STEPS[BUCKET_STEPS.length-1];
export const tileHeightFor=(wanted:number)=>TILE_HEIGHTS.find(h=>h>=wanted)??TILE_HEIGHTS[TILE_HEIGHTS.length-1];
/** The source time a bucket is decoded at: its index times its step, clamped just inside the source so the last bucket still has a frame. */
export function bucketTime(index:number,step:number,duration:number){
 const t=index*step;if(!(duration>0))return Math.max(0,t);
 return Math.min(Math.max(0,t),Math.max(0,duration-0.02));
}
export const bucketIndex=(time:number,step:number)=>Math.max(0,Math.round(time/step));
/** Stable cache key of one thumbnail. `gen` changes whenever the source is re-registered, which drops every older thumbnail. */
export const tileKey=(source:string,gen:number,step:number,index:number,height:number)=>`${source}|${gen}|${step}|${index}|${height}`;
export interface TileSpec{x:number;width:number;index:number;step:number;time:number}
export interface StripLayout{tiles:TileSpec[];step:number;tileWidth:number;tileHeight:number}
/**
 * Lays tiles across a clip's strip. `widthPx` is the clip's on-screen width, `[in_s,out_s]` its source range.
 * Tiles are `heightPx*aspect` wide; the last one is cut by the clip edge. Each tile shows the bucket nearest its centre.
 */
export function layoutStrip(opts:{widthPx:number;heightPx:number;aspect:number;in_s:number;out_s:number;duration:number}):StripLayout{
 const{widthPx,heightPx,in_s,out_s,duration}=opts;
 const tileHeight=tileHeightFor(heightPx);
 const aspect=Number.isFinite(opts.aspect)&&opts.aspect>0?Math.min(4,Math.max(0.25,opts.aspect)):16/9;
 const tileWidth=Math.max(8,Math.round(heightPx*aspect));
 const span=Math.max(0,out_s-in_s);
 if(!(widthPx>=1)||!(span>0))return{tiles:[],step:BUCKET_STEPS[0],tileWidth,tileHeight};
 const step=bucketStep(span/widthPx*tileWidth);
 const count=Math.min(2000,Math.ceil(widthPx/tileWidth));
 const tiles:TileSpec[]=[];
 for(let i=0;i<count;i++){
  const x=i*tileWidth,w=Math.min(tileWidth,widthPx-x);
  const centre=in_s+(x+w/2)/widthPx*span;
  const index=bucketIndex(Math.min(Math.max(in_s,centre),out_s),step);
  tiles.push({x,width:w,index,step,time:bucketTime(index,step,duration)});
 }
 return{tiles,step,tileWidth,tileHeight};
}
