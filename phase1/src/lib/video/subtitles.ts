/**
 * SRT/VTT/ASS cue parsing into title overlays. Tolerant by design: the SRT/VTT path anchors on `-->` timing
 * lines only, the ASS path reads Dialogue events; broken or empty cues drop instead of failing the import.
 * Styling is cue-wide (one TitleSpec per cue): a cue with ANY bold/italic tag becomes bold/italic, the FIRST
 * font colour wins; per-word styling would need a richer title model. Pure model - no DOM.
 */
import {newTitleOverlay,type OverlayClip,type OverlayRect} from './overlayTrack';
import {clampTitleSeconds,MAX_TITLE_CHARS,type TitleSpec} from './titles';

export interface SubtitleCue{at:number;duration:number;text:string;color?:string;bold?:boolean;italic?:boolean;align?:TitleSpec['align'];vAlign?:TitleSpec['vAlign'];rect?:OverlayRect}

const TIME=/(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;
const ARROW=new RegExp(`${TIME.source}\\s*-->\\s*${TIME.source}`);
const timeS=(m:RegExpMatchArray,off:number)=>((Number(m[off]??0)*60+Number(m[off+1]))*60+Number(m[off+2]))+Number(m[off+3].padEnd(3,'0'))/1000;
const stripTags=(s:string)=>s.replace(/<[^>]+>/g,'');
const clamp01=(v:number)=>Math.min(1,Math.max(0,v));

/** SRT/VTT inline tags: bold/italic are cue-wide booleans; the first <font color> wins. */
function inlineStyle(body:string[]):Pick<SubtitleCue,'color'|'bold'|'italic'>{
 const joined=body.join('\n');
 const color=joined.match(/<font[^>]*color="?(#[0-9a-fA-F]{3,6}|[a-zA-Z]+)"?/i)?.[1];
 const css=color&&color.startsWith('#')?(color.length===4?`#${[...color.slice(1)].map(c=>c+c).join('')}`:color.toLowerCase()):undefined;
 return{color:css,bold:/<b(\s|>)/i.test(joined)||undefined,italic:/<i(\s|>)/i.test(joined)||undefined};
}

/** VTT cue settings after the end time: align maps directly; position/line percentages nudge the rect. */
function vttSettings(tail:string):Pick<SubtitleCue,'align'|'rect'>{
 const out:Pick<SubtitleCue,'align'|'rect'>={};
 const align=tail.match(/align:(start|middle|end|left|right|center)/)?.[1];
 if(align)out.align=align==='start'||align==='left'?'left':align==='end'||align==='right'?'right':'center';
 const pos=tail.match(/position:(\d{1,3})%/)?.[1],line=tail.match(/line:(-?\d{1,3})%/)?.[1];
 if(pos!==undefined||line!==undefined){
  // The 60%-wide, 23%-high lower-third box recentres on the cue anchor; edges clamp into the frame.
  const x=pos!==undefined?clamp01(Number(pos)/100-0.3):0.05;
  const y=line!==undefined?clamp01(Number(line)/100-0.115):0.72;
  out.rect={x:Number(Math.min(0.4,x).toFixed(3)),y:Number(Math.min(0.77,y).toFixed(3)),w:0.6,h:0.23};
 }
 return out;
}

/** ASS override tags {\b1 \i1 \c&HBBGGRR& \anN \pos(x,y)}; the remaining {…} blocks strip. ASS colours are BGR. */
function assStyle(raw:string):Pick<SubtitleCue,'color'|'bold'|'italic'|'align'|'vAlign'|'rect'>&{text:string}{
 const out:ReturnType<typeof assStyle>={text:raw};
 const block=raw.match(/\{[^}]*\}/)?.[0];
 if(block){
  if(/\\b1/.test(block))out.bold=true;
  if(/\\i1/.test(block))out.italic=true;
  const c=block.match(/\\c&H([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})&/);
  if(c)out.color=`#${c[3]}${c[2]}${c[1]}`.toLowerCase();
  const an=block.match(/\\an([1-9])/)?.[1];
  if(an){const n=Number(an);out.vAlign=n>=7?'top':n>=4?'middle':'bottom';out.align=n%3===1?'left':n%3===0?'right':'center';}
  const pos=block.match(/\\pos\((\d+(?:\.\d+)?),(\d+(?:\.\d+)?)\)/);
  if(pos){
   // ASS coordinates are pixels of the script's video; PlayRes is rarely known here, so 1920x1080 is assumed.
   const x=clamp01(Number(pos[1])/1920-0.3),y=clamp01(Number(pos[2])/1080-0.115);
   out.rect={x:Number(Math.min(0.4,x).toFixed(3)),y:Number(Math.min(0.77,y).toFixed(3)),w:0.6,h:0.23};
  }
 }
 out.text=raw.replace(/\{[^}]*\}/g,'').replace(/\\N/gi,'\n').trim();
 return out;
}

/** Parses SRT, WebVTT or ASS (detected by the [Events] section) into cues sorted by start. Never throws. */
export function parseSubtitles(text:string):SubtitleCue[]{
 const clean=text.replace(/\r\n?/g,'\n').replace(/^﻿/,'');
 if(/^\[Events\]/m.test(clean))return parseAss(clean);
 const lines=clean.split('\n');
 const cues:SubtitleCue[]=[];
 let i=0,inBlock=false;
 while(i<lines.length){
  const line=lines[i];
  if(/^(NOTE|STYLE|REGION)(\s|$)/.test(line)){inBlock=true;i++;continue;}
  if(inBlock){if(!line.trim())inBlock=false;i++;continue;}
  const m=line.match(ARROW);
  if(!m){i++;continue;}
  const at=timeS(m,1),end=timeS(m,5);
  const body:string[]=[];
  i++;
  while(i<lines.length&&lines[i].trim()){body.push(lines[i]);i++;}
  const text2=body.map(l=>stripTags(l).trim()).filter(Boolean).join('\n').slice(0,MAX_TITLE_CHARS);
  if(text2&&end>at)cues.push({at,duration:clampTitleSeconds(end-at),text:text2,...inlineStyle(body),...vttSettings(line.slice(m[0].length))});
 }
 return cues.sort((a,b)=>a.at-b.at);
}

const ASS_TIME=/(\d+):(\d{2}):(\d{2})\.(\d{1,2})/;
const assTime=(m:RegExpMatchArray)=>((Number(m[1])*60+Number(m[2]))*60+Number(m[3]))+Number(m[4].padEnd(2,'0'))/100;
/** ASS Dialogue events: start, end and text after the 9th comma; override tags become cue styling. */
function parseAss(text:string):SubtitleCue[]{
 const cues:SubtitleCue[]=[];
 for(const line of text.split('\n')){
  const m=line.match(/^\s*Dialogue:\s*[^,]*,\s*([^,]+),\s*([^,]+),/);
  if(!m)continue;
  const s1=m[1].match(ASS_TIME),s2=m[2].match(ASS_TIME);
  if(!s1||!s2)continue;
  const at=assTime(s1),end=assTime(s2);
  const raw=line.slice(m[0].length).split(',').slice(6).join(',');
  const styled=assStyle(raw);
  const text2=styled.text.slice(0,MAX_TITLE_CHARS);
  if(text2&&end>at)cues.push({at,duration:clampTitleSeconds(end-at),...styled,text:text2});
 }
 return cues.sort((a,b)=>a.at-b.at);
}

/** One lower-third title overlay per cue; parsed styling (colour, weight, alignment, position) goes into the spec/rect. */
export const cuesToTitleOverlays=(cues:SubtitleCue[]):OverlayClip[]=>cues.map(c=>{
 const spec:Partial<TitleSpec>={text:c.text};
 if(c.color)spec.color=c.color;
 if(c.bold)spec.bold=true;
 if(c.italic)spec.italic=true;
 if(c.align)spec.align=c.align;
 if(c.vAlign)spec.vAlign=c.vAlign;
 const o=newTitleOverlay(spec,c.at,c.duration);
 if(c.rect)o.rect=c.rect;
 return o;
});

/** Decodes a subtitle file's bytes: strict UTF-8 first, ISO-8859-1 (Latin-1) as the fallback for legacy SRTs. */
export function decodeSubtitleBytes(bytes:Uint8Array):string{
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
 catch{return new TextDecoder('iso-8859-1').decode(bytes);}
}
