/** Viewer guides: safe areas, centre, thirds and grid overlays (view state, never exported), plus ruler guides saved with the composition. Pure and bounded. */
export type GuideAxis='x'|'y';
export interface Guide{axis:GuideAxis;at:number}
export const MAX_GUIDES=20;
export const OVERLAY_KEYS=['safe','center','thirds','grid'] as const;
export type OverlayKey=typeof OVERLAY_KEYS[number];
export type Overlays=Record<OverlayKey,boolean>;
export const defaultOverlays=():Overlays=>({safe:false,center:false,thirds:false,grid:false});
export const normalizeOverlays=(x:unknown):Overlays=>{const o=defaultOverlays();if(x&&typeof x==='object')for(const k of OVERLAY_KEYS)o[k]=(x as Partial<Overlays>)[k]===true;return o;};
/** Guides are valid when there are at most MAX_GUIDES, each on its axis inside the composition, and none repeats. */
export function validGuides(g:unknown,width:number,height:number):boolean{
 if(g===undefined)return true;if(!Array.isArray(g)||g.length===0||g.length>MAX_GUIDES)return false;
 const seen=new Set<string>();
 return g.every((x:Guide)=>{if(!x||(x.axis!=='x'&&x.axis!=='y')||typeof x.at!=='number'||!Number.isFinite(x.at)||x.at<0||x.at>(x.axis==='x'?width:height)||Object.keys(x).length!==2)return false;const k=`${x.axis}:${x.at}`;if(seen.has(k))return false;seen.add(k);return true;});
}
export interface Rect{x:number;y:number;width:number;height:number}
export interface Line{x1:number;y1:number;x2:number;y2:number}
/** Title safe (90 %) and action safe (93 %) rectangles. */
export const safeRects=(w:number,h:number):{action:Rect;title:Rect}=>{const q=(n:number)=>Math.round(n*100)/100,r=(f:number):Rect=>({x:q(w*(1-f)/2),y:q(h*(1-f)/2),width:q(w*f),height:q(h*f)});return {action:r(0.93),title:r(0.9)};};
/** Grid step in pixels: 50, or larger so a big composition never draws more than about 80 lines. */
export const gridStep=(w:number,h:number)=>Math.max(50,Math.ceil(Math.max(w,h)/80/10)*10);
/** Lines of the centre cross, thirds and grid overlays, in composition pixels. */
export function overlayLines(w:number,h:number,o:Overlays):{grid:Line[];thirds:Line[];center:Line[]}{
 const v=(x:number):Line=>({x1:x,y1:0,x2:x,y2:h}),hz=(y:number):Line=>({x1:0,y1:y,x2:w,y2:y});
 const grid:Line[]=[];if(o.grid){const s=gridStep(w,h);for(let x=s;x<w;x+=s)grid.push(v(x));for(let y=s;y<h;y+=s)grid.push(hz(y));}
 return {grid,thirds:o.thirds?[v(w/3),v(w*2/3),hz(h/3),hz(h*2/3)]:[],center:o.center?[v(w/2),hz(h/2)]:[]};
}
export const addGuide=(g:readonly Guide[]|undefined,n:Guide):Guide[]=>[...(g??[]),n];
