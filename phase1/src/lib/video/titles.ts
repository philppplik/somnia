/**
 * Title/text clips (contract with the swarm lead): a `TimelineClip` with `kind:'title'`, `source:''`, `in_s:0`,
 * `out_s` = duration in seconds (0.05-3600), `gain:1`, `muted:false` and a `title` spec. Pure model + canvas drawing,
 * no DOM, no engine, no mediabunny. Works before and after `kind`/`title` are added to the TimelineClip interface.
 */
import type {TimelineClip} from './timeline';
import {MIN_CLIP_SECONDS,newClipId,timelineDuration} from './timeline';

export type TitleFont='sans'|'serif'|'mono';
export type TitleAlign='left'|'center'|'right';
export type TitleVAlign='top'|'middle'|'bottom';
/** The four contract fields plus optional extras; every extra has a default, so `{text,size,color,background}` alone is valid. */
export interface TitleSpec{
 text:string;
 /** Font size in px on a 1080-line frame; scaled with the real frame height (so 72 is 6.7% of any frame). 8-600. */
 size:number;
 /** CSS hex colours (#rgb or #rrggbb). */
 color:string;background:string;
 font?:TitleFont;bold?:boolean;italic?:boolean;align?:TitleAlign;vAlign?:TitleVAlign;
 /** Fade from/to black at the card's boundaries, seconds (default 0 = hard cut). */
 fadeIn?:number;fadeOut?:number;
}
export type TitleClip=TimelineClip&{kind:'title';title:TitleSpec};

export const REFERENCE_HEIGHT=1080;
export const DEFAULT_TITLE_SECONDS=3;
export const MAX_TITLE_SECONDS=3600;
export const MAX_TITLE_CHARS=500;
export const FONT_STACKS:Record<TitleFont,string>={sans:'system-ui, "Segoe UI", Helvetica, Arial, sans-serif',serif:'Georgia, "Times New Roman", serif',mono:'ui-monospace, Consolas, "Courier New", monospace'};
export const DEFAULT_TITLE:Required<TitleSpec>={text:'Title',size:72,color:'#ffffff',background:'#111827',font:'sans',bold:true,italic:false,align:'center',vAlign:'middle',fadeIn:0,fadeOut:0};

export const isTitleClip=(c:TimelineClip):c is TitleClip=>(c as {kind?:string}).kind==='title'&&typeof (c as {title?:unknown}).title==='object'&&(c as {title?:unknown}).title!==null;
/** Clips that need an opened media file to render; the pipeline and session skip title clips with this. */
export const needsSourceFile=(c:TimelineClip)=>!isTitleClip(c);
/** Label for timeline blocks and the clip chip: the card text for titles, `fallback` otherwise. */
export const clipDisplayName=(c:TimelineClip,fallback:string)=>isTitleClip(c)?(c.title.text.split('\n').find(l=>l.trim())?.trim().slice(0,40)||'Title'):fallback;

const HEX=/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const clamp=(n:number,lo:number,hi:number,fb:number)=>Number.isFinite(n)?Math.min(hi,Math.max(lo,n)):fb;
const oneOf=<T extends string>(v:unknown,all:readonly T[],fb:T):T=>all.includes(v as T)?v as T:fb;
/** Coerces anything (a partial patch, a stored value) into a complete valid spec; invalid fields fall back to `base`. */
export function sanitizeTitleSpec(input:Partial<TitleSpec>|null|undefined,base:Required<TitleSpec>=DEFAULT_TITLE):Required<TitleSpec>{
 const s=input??{};
 return{
  text:(typeof s.text==='string'?s.text:base.text).replace(/\r\n?/g,'\n').slice(0,MAX_TITLE_CHARS),
  size:clamp(Number(s.size??base.size),8,600,base.size),
  color:typeof s.color==='string'&&HEX.test(s.color)?s.color.toLowerCase():base.color,
  background:typeof s.background==='string'&&HEX.test(s.background)?s.background.toLowerCase():base.background,
  font:oneOf(s.font,['sans','serif','mono'] as const,base.font),
  bold:typeof s.bold==='boolean'?s.bold:base.bold,italic:typeof s.italic==='boolean'?s.italic:base.italic,
  align:oneOf(s.align,['left','center','right'] as const,base.align),
  vAlign:oneOf(s.vAlign,['top','middle','bottom'] as const,base.vAlign),
  fadeIn:clamp(Number(s.fadeIn??base.fadeIn),0,10,base.fadeIn),fadeOut:clamp(Number(s.fadeOut??base.fadeOut),0,10,base.fadeOut),
 };
}
export const clampTitleSeconds=(d:number)=>Number(clamp(d,MIN_CLIP_SECONDS,MAX_TITLE_SECONDS,DEFAULT_TITLE_SECONDS).toFixed(3));
/** A new title clip of `seconds`, in the contract shape. */
export function newTitleClip(spec:Partial<TitleSpec>={},seconds=DEFAULT_TITLE_SECONDS):TitleClip{
 return{id:newClipId(),kind:'title',source:'',in_s:0,out_s:clampTitleSeconds(seconds),gain:1,muted:false,title:sanitizeTitleSpec(spec)};
}
/** The sanitize rule for one title clip (contract): in_s=0, out_s in [MIN_CLIP_SECONDS,3600], gain 1, not muted, source '', valid spec. */
export const sanitizeTitleClip=(c:TitleClip):TitleClip=>({...c,kind:'title',source:'',in_s:0,out_s:clampTitleSeconds(c.out_s-(Number.isFinite(c.in_s)?c.in_s:0)),gain:1,muted:false,title:sanitizeTitleSpec(c.title)});
/** Applies `sanitizeTitleClip` to every title clip and leaves other clips as they are. */
export const normalizeTitleClips=(clips:TimelineClip[]):TimelineClip[]=>clips.map(c=>isTitleClip(c)?sanitizeTitleClip(c):c);
/**
 * Splits a title at a local time (seconds from its start). Both halves are valid title clips (in_s 0, own duration).
 * `splitAt` in timeline.ts must call this for title clips: its generic in/out split would give the right half in_s>0.
 */
export function splitTitleClip(c:TitleClip,local:number):[TitleClip,TitleClip]|null{
 const d=c.out_s-c.in_s;
 if(local<MIN_CLIP_SECONDS||d-local<MIN_CLIP_SECONDS)return null;
 const l=Number(local.toFixed(3));
 return[{...c,id:newClipId(),in_s:0,out_s:l},{...c,id:newClipId(),in_s:0,out_s:Number((d-l).toFixed(3))}];
}
/** Inserts a clip at an index (clamped); returns a new array. */
export function insertClip(clips:TimelineClip[],clip:TimelineClip,index:number):TimelineClip[]{
 const at=Math.min(clips.length,Math.max(0,Math.round(index)));return[...clips.slice(0,at),clip,...clips.slice(at)];
}
/** Index right after the clip under `time` (so a title lands after the clip being watched); end of timeline when past it. */
export function insertIndexAfter(clips:TimelineClip[],time:number):number{
 let t=0;for(let i=0;i<clips.length;i++){t+=clips[i].out_s-clips[i].in_s;if(time<t-1e-9)return i+1;}
 return clips.length;
}
/** Patches the text/style of one title clip. Non-title clips and unknown ids are returned untouched (same array when nothing changed). */
export function patchTitle(clips:TimelineClip[],id:string,patch:Partial<TitleSpec>):TimelineClip[]{
 let changed=false;
 const out=clips.map(c=>{
  if(c.id!==id||!isTitleClip(c))return c;
  const title=sanitizeTitleSpec({...c.title,...patch},sanitizeTitleSpec(c.title));
  if(JSON.stringify(title)===JSON.stringify(sanitizeTitleSpec(c.title)))return c;
  changed=true;return{...c,title};
 });
 return changed?out:clips;
}
/** Sets the length of one title clip (0.05-3600 s). */
export function setTitleDuration(clips:TimelineClip[],id:string,seconds:number):TimelineClip[]{
 const d=clampTitleSeconds(seconds);
 return clips.map(c=>c.id===id&&isTitleClip(c)?{...c,in_s:0,out_s:d}:c);
}
export const titleSeconds=(clips:TimelineClip[])=>timelineDuration(clips.filter(isTitleClip));

/** Opacity of the card at local time `t` (0..duration): linear fades, never longer than half the card each. */
export function titleAlphaAt(spec:Pick<TitleSpec,'fadeIn'|'fadeOut'>,duration:number,t:number):number{
 if(duration<=0)return 0;
 const half=duration/2,fi=Math.min(spec.fadeIn??0,half),fo=Math.min(spec.fadeOut??0,half);
 let a=1;
 if(fi>0&&t<fi)a=Math.min(a,Math.max(0,t/fi));
 if(fo>0&&t>duration-fo)a=Math.min(a,Math.max(0,(duration-t)/fo));
 return Math.min(1,Math.max(0,a));
}
/** Whether two local times render the same pixels (lets the exporter and preview skip redraws). */
export const titleFrameKey=(spec:Pick<TitleSpec,'fadeIn'|'fadeOut'>,duration:number,t:number)=>titleAlphaAt(spec,duration,t).toFixed(4);

/** Greedy word wrap into lines no wider than `maxWidth`; explicit newlines kept; over-long words are broken by character. */
export function wrapLines(text:string,maxWidth:number,measure:(s:string)=>number):string[]{
 const out:string[]=[];
 for(const para of text.split('\n')){
  if(!para.trim()){out.push('');continue;}
  let line='';
  for(const word of para.split(/\s+/).filter(Boolean)){
   const next=line?`${line} ${word}`:word;
   if(measure(next)<=maxWidth){line=next;continue;}
   if(line)out.push(line);
   if(measure(word)<=maxWidth){line=word;continue;}
   let chunk='';
   for(const ch of word){if(chunk&&measure(chunk+ch)>maxWidth){out.push(chunk);chunk=ch;}else chunk+=ch;}
   line=chunk;
  }
  out.push(line);
 }
 return out;
}

/** The slice of the 2D context the drawing needs; satisfied by CanvasRenderingContext2D and OffscreenCanvasRenderingContext2D. */
export interface TitleContext{
 fillStyle:unknown;font:string;textAlign:string;textBaseline:string;globalAlpha:number;
 fillRect(x:number,y:number,w:number,h:number):void;fillText(text:string,x:number,y:number):void;measureText(text:string):{width:number};
}
export const fontShorthand=(spec:Pick<TitleSpec,'bold'|'italic'|'font'>,px:number)=>`${spec.italic?'italic ':''}${spec.bold!==false?'700 ':'400 '}${Math.round(px*100)/100}px ${FONT_STACKS[spec.font??'sans']}`;
export interface TitleLayout{lines:string[];fontPx:number;lineHeight:number;x:number;top:number}
/** Layout in frame pixels: size is px on a 1080-line frame, scaled to the real height; text wraps inside a 8% margin and shrinks (never below 40%) when it still overflows. */
export function layoutTitle(spec0:TitleSpec,w:number,h:number,measureWith:(font:string)=>(s:string)=>number):TitleLayout{
 const spec=sanitizeTitleSpec(spec0);
 const margin=Math.round(Math.min(w,h)*0.08),maxW=Math.max(1,w-margin*2),maxH=Math.max(1,h-margin*2);
 const basePx=Math.max(4,h*spec.size/REFERENCE_HEIGHT);
 let px=basePx,lines:string[]=[];
 for(let i=0;i<12;i++){
  lines=wrapLines(spec.text,maxW,measureWith(fontShorthand(spec,px)));
  if(lines.length*px*1.25<=maxH||px<=basePx*0.4)break;
  px=Math.max(basePx*0.4,px*0.9);
 }
 const lineHeight=px*1.25,total=lines.length*lineHeight;
 const x=spec.align==='left'?margin:spec.align==='right'?w-margin:w/2;
 const top=spec.vAlign==='top'?margin:spec.vAlign==='bottom'?h-margin-total:(h-total)/2;
 return{lines,fontPx:px,lineHeight,x,top};
}
/** Draws one frame of a title card at local time `t`. The background fades in from black so a card joins video cleanly. */
export function drawTitle(ctx:TitleContext,spec0:TitleSpec,w:number,h:number,t:number,duration:number):void{
 const spec=sanitizeTitleSpec(spec0);
 const alpha=titleAlphaAt(spec,duration,t);
 ctx.globalAlpha=1;ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
 ctx.globalAlpha=alpha;ctx.fillStyle=spec.background;ctx.fillRect(0,0,w,h);
 const layout=layoutTitle(spec,w,h,font=>{ctx.font=font;return s=>ctx.measureText(s).width;});
 ctx.font=fontShorthand(spec,layout.fontPx);ctx.textAlign=spec.align;ctx.textBaseline='middle';ctx.fillStyle=spec.color;
 layout.lines.forEach((line,i)=>{if(line)ctx.fillText(line,layout.x,layout.top+layout.lineHeight*(i+0.5));});
 ctx.globalAlpha=1;
}
/** The contract entry point for the export (and any renderer): draws title clip `clip` at `t` seconds into it (default 0). */
export const drawTitleCard=(ctx:TitleContext,clip:TitleClip,w:number,h:number,t=0):void=>drawTitle(ctx,clip.title,w,h,Math.max(0,Math.min(t,clip.out_s-clip.in_s)),clip.out_s-clip.in_s);
