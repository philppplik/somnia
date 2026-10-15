/**
 * SRT/VTT cue parsing into title overlays. Tolerant by design: the parser anchors on `-->` timing lines only,
 * so SRT sequence numbers and VTT cue identifiers, NOTE/STYLE blocks and headers are skipped implicitly, and
 * cues with broken times or empty text drop out instead of failing the import. Pure model - no DOM.
 */
import {newTitleOverlay,type OverlayClip} from './overlayTrack';
import {clampTitleSeconds,MAX_TITLE_CHARS} from './titles';

export interface SubtitleCue{at:number;duration:number;text:string}

const TIME=/(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;
const ARROW=new RegExp(`${TIME.source}\\s*-->\\s*${TIME.source}`);
const timeS=(m:RegExpMatchArray,off:number)=>((Number(m[off]??0)*60+Number(m[off+1]))*60+Number(m[off+2]))+Number(m[off+3].padEnd(3,'0'))/1000;
/** Inline markup (<b>, <i>, <font>, VTT voice tags) carries no styling into title cards - strip it. */
const stripTags=(s:string)=>s.replace(/<[^>]+>/g,'');

/** Parses SRT or WebVTT text into cues sorted by start. Unknown content is skipped, never thrown. */
export function parseSubtitles(text:string):SubtitleCue[]{
 const lines=text.replace(/\r\n?/g,'\n').replace(/^\uFEFF/,'').split('\n');
 const cues:SubtitleCue[]=[];
 let i=0,inBlock=false;
 while(i<lines.length){
  const line=lines[i];
  // VTT NOTE/STYLE/REGION blocks run until the next blank line.
  if(/^(NOTE|STYLE|REGION)(\s|$)/.test(line)){inBlock=true;i++;continue;}
  if(inBlock){if(!line.trim())inBlock=false;i++;continue;}
  const m=line.match(ARROW);
  if(!m){i++;continue;}
  const at=timeS(m,1),end=timeS(m,5);
  const body:string[]=[];
  i++;
  while(i<lines.length&&lines[i].trim()){body.push(stripTags(lines[i]).trim());i++;}
  const text2=body.filter(Boolean).join('\n').slice(0,MAX_TITLE_CHARS);
  if(text2&&end>at)cues.push({at,duration:clampTitleSeconds(end-at),text:text2});
 }
 return cues.sort((a,b)=>a.at-b.at);
}

/** One lower-third title overlay per cue (array order = z-order, overlaps allowed by the track). */
export const cuesToTitleOverlays=(cues:SubtitleCue[]):OverlayClip[]=>cues.map(c=>newTitleOverlay({text:c.text},c.at,c.duration));
