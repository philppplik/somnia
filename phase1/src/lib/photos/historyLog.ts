import {photoSignature,type PhotoSettings} from './studioSettings';
import type {PhotoSession} from './studioSession';
/** Human-readable edit log derived from the session's undo stack. Pure: no engine, no UI. */
export interface SettingChange{key:keyof PhotoSettings&string;from:unknown;to:unknown}
const KEYS:(keyof PhotoSettings&string)[]=['exposure','contrast','highlights','shadows','whites','blacks','temp','tint','vibrance','saturation','texture','clarity','dehaze','sharpen','noiseLuminance','noiseColor','straighten','orientation','flipH','flipV','crop'];
export function describeChange(prev:PhotoSettings,next:PhotoSettings):SettingChange[]{
 const out:SettingChange[]=[];
 for(const key of KEYS){if(JSON.stringify(prev[key])!==JSON.stringify(next[key]))out.push({key,from:prev[key],to:next[key]});}
 return out;
}
export interface HistoryEntry{
 /** Position in the timeline: 0 is the state the photo was opened in. */
 index:number;current:boolean;
 /** `done` states are at or before the current one, `undone` states can be redone. */
 status:'done'|'undone';
 /** What changed compared to the previous entry. Empty for index 0. */
 changes:SettingChange[];
}
/** Timeline: past (oldest first), now, future (future[0] is the next redo). */
export function historyTimeline(s:Pick<PhotoSession,'past'|'now'|'future'>):PhotoSettings[]{return [...s.past,s.now,...s.future];}
export function historyEntries(s:Pick<PhotoSession,'past'|'now'|'future'>):HistoryEntry[]{
 const line=historyTimeline(s);const cur=s.past.length;
 return line.map((state,index)=>({index,current:index===cur,status:index<=cur?'done':'undone',changes:index===0?[]:describeChange(line[index-1],state)}));
}
/** Undo (negative) or redo (positive) steps needed to reach timeline `index`; null when out of range. */
export function stepsTo(s:Pick<PhotoSession,'past'|'future'>,index:number):number|null{
 if(!Number.isInteger(index)||index<0||index>s.past.length+s.future.length)return null;return index-s.past.length;
}
/** Timeline states are deduped by the session, but guard against equal neighbours anyway. */
export const sameState=(a:PhotoSettings,b:PhotoSettings)=>photoSignature(a)===photoSignature(b);
