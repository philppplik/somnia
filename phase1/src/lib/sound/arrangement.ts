import {emptyRack,validateRack,type EffectRack} from './rack';
/** Dependency-free Sound session document. Time is integer session-rate frames, not pixels. */
export const ARRANGE_LIMITS={tracks:8,clips:128,sources:32,seconds:120,sourceFrames:12_000_000,history:50,tailSeconds:10,gainPoints:32} as const;
export interface AudioSourceRef{id:string;name:string;frames:number;sampleRate:number;channels:1|2}
/** One gain automation point: clip-local frame and level in dB. Points are sorted, unique per position, linear in dB between points. */
export interface GainPoint{at:number;db:number}
/** name: free label for organisation (bounces, freezes); empty falls back to the source name. */
export interface ArrangeClip{id:string;sourceId:string;start:number;offset:number;length:number;gainDb:number;fadeIn:number;fadeOut:number;gainCurve:GainPoint[];muted:boolean;pan:number;fadeShape:'linear'|'equalPower';name:string}
export interface ArrangeTrack{id:string;name:string;gainDb:number;pan:number;mute:boolean;solo:boolean;rack:EffectRack;clips:ArrangeClip[]}
export interface ArrangeMarker{id:string;name:string;frame:number}
/** tailFrames: explicit bounded effect tail appended past the last clip so reverb/delay can ring out; 0 keeps the B1 session boundary. bpm: musical tempo for the beat grid and snapping; the mix itself is tempo-agnostic. */
export interface Arrangement{version:9;masterRack:EffectRack;name:string;sampleRate:48000;sources:AudioSourceRef[];tracks:ArrangeTrack[];markers:ArrangeMarker[];loop:{start:number;end:number}|null;tailFrames:number;bpm:number}
export function emptyArrangement(name='Untitled session'):Arrangement{return{version:9,masterRack:emptyRack(),name,sampleRate:48000,sources:[],tracks:[],markers:[],loop:null,tailFrames:0,bpm:120};}
const fail=(s:string):never=>{throw Error(`Invalid Sound session: ${s}`);};
const object=(v:unknown,keys:string[]):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))return fail('object expected');const o=v as Record<string,unknown>;if(Object.keys(o).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(o,k)))return fail('unknown or missing field');return o;};
const text=(v:unknown,max=160):string=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\x00-\x1f]/.test(v)?v:fail('text');
const clipName=(v:unknown,max=160):string=>typeof v==='string'&&v.length<=max&&!/[\x00-\x1f]/.test(v)?v:fail('text');
const number=(v:unknown,min:number,max:number,integer=false):number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max&&(!integer||Number.isSafeInteger(v))?v:fail('number');
const list=(v:unknown,max:number):unknown[]=>Array.isArray(v)&&v.length<=max?v:fail('list limit');
/** Strict bounded parsing: persisted documents and UI commands use the same validator. */
export function validateArrangement(raw:unknown):Arrangement{
 // Migrate A's neutral v1 document without altering clips, timing or audio settings.
 if(raw&&typeof raw==='object'&&(raw as {version?:unknown}).version===1){const old=object(raw,['version','name','sampleRate','sources','tracks','markers','loop']);raw={...old,version:2,masterRack:emptyRack(),tracks:list(old.tracks,ARRANGE_LIMITS.tracks).map(v=>({...object(v,['id','name','gainDb','pan','mute','solo','clips']),rack:emptyRack()}))};}
 // v2 adds a neutral empty tail; audio settings, clips and timing are untouched.
 if(raw&&typeof raw==='object'&&(raw as {version?:unknown}).version===2){const old=object(raw,['version','name','sampleRate','sources','tracks','markers','loop','masterRack']);raw={...old,version:3,tailFrames:0};}
 // v4 adds a neutral empty gain curve per clip; nothing audible changes.
 if(raw&&typeof raw==='object'&&(raw as {version?:unknown}).version===3){const old=object(raw,['version','name','sampleRate','sources','tracks','markers','loop','masterRack','tailFrames']);raw={...old,version:4,tracks:list(old.tracks,ARRANGE_LIMITS.tracks).map(t=>({...(t as Record<string,unknown>),clips:(t as {clips:unknown[]}).clips.map(c=>({...(c as Record<string,unknown>),gainCurve:[]}))}))};}
 if(raw&&typeof raw==='object'&&(raw as {version?:unknown}).version===4){const old=object(raw,['version','name','sampleRate','sources','tracks','markers','loop','masterRack','tailFrames']);raw={...old,version:5,tracks:list(old.tracks,ARRANGE_LIMITS.tracks).map(t=>({...(t as Record<string,unknown>),clips:(t as {clips:unknown[]}).clips.map(c=>({...(c as Record<string,unknown>),muted:false}))}))};}
 if(raw&&typeof raw==='object'&&(raw as {version?:unknown}).version===5){const old=object(raw,['version','name','sampleRate','sources','tracks','markers','loop','masterRack','tailFrames']);raw={...old,version:6,tracks:list(old.tracks,ARRANGE_LIMITS.tracks).map(t=>({...(t as Record<string,unknown>),clips:(t as {clips:unknown[]}).clips.map(c=>({...(c as Record<string,unknown>),pan:0}))}))};}
 if(raw&&typeof raw==='object'&&(raw as {version?:unknown}).version===6){const old=object(raw,['version','name','sampleRate','sources','tracks','markers','loop','masterRack','tailFrames']);raw={...old,version:7,tracks:list(old.tracks,ARRANGE_LIMITS.tracks).map(t=>({...(t as Record<string,unknown>),clips:(t as {clips:unknown[]}).clips.map(c=>({...(c as Record<string,unknown>),fadeShape:'linear'}))}))};}
 if(raw&&typeof raw==='object'&&(raw as {version?:unknown}).version===7){const old=object(raw,['version','name','sampleRate','sources','tracks','markers','loop','masterRack','tailFrames']);raw={...old,version:8,bpm:120};}
 if(raw&&typeof raw==='object'&&(raw as {version?:unknown}).version===8){const old=object(raw,['version','name','sampleRate','sources','tracks','markers','loop','masterRack','tailFrames','bpm']);raw={...old,version:9,tracks:list(old.tracks,ARRANGE_LIMITS.tracks).map(t=>({...(t as Record<string,unknown>),clips:(t as {clips:unknown[]}).clips.map(c=>({...(c as Record<string,unknown>),name:''}))}))};}
 const o=object(raw,['version','name','sampleRate','sources','tracks','markers','loop','masterRack','tailFrames','bpm']);if(o.version!==9||o.sampleRate!==48000)return fail('version or sample rate');
 const ids=new Set<string>();const id=(v:unknown)=>{const s=text(v,100);if(ids.has(s))return fail('duplicate identity');ids.add(s);return s;};
 const sources=list(o.sources,ARRANGE_LIMITS.sources).map(v=>{const s=object(v,['id','name','frames','sampleRate','channels']);return{id:id(s.id),name:text(s.name),frames:number(s.frames,1,ARRANGE_LIMITS.sourceFrames,true),sampleRate:number(s.sampleRate,8000,192000,true),channels:number(s.channels,1,2,true) as 1|2};});
 if(sources.reduce((n,s)=>n+s.frames*s.channels,0)>ARRANGE_LIMITS.sourceFrames)return fail('source memory budget');
 const max=48000*ARRANGE_LIMITS.seconds;let count=0;
 const tracks=list(o.tracks,ARRANGE_LIMITS.tracks).map(v=>{const t=object(v,['id','name','gainDb','pan','mute','solo','clips','rack']);if(typeof t.mute!=='boolean'||typeof t.solo!=='boolean')return fail('track flags');
  const clips=list(t.clips,ARRANGE_LIMITS.clips).map(v=>{if(++count>ARRANGE_LIMITS.clips)return fail('clip limit');const c=object(v,['id','sourceId','start','offset','length','gainDb','fadeIn','fadeOut','gainCurve','muted','pan','fadeShape','name']);if(c.fadeShape!=='linear'&&c.fadeShape!=='equalPower')return fail('fade shape');if(typeof c.muted!=='boolean')return fail('clip flags');const source=sources.find(s=>s.id===c.sourceId);if(!source)return fail('missing source reference');
   const start=number(c.start,0,max-1,true),offset=number(c.offset,0,max,true),length=number(c.length,1,max,true);if(start+length>max||offset+length>Math.floor(source.frames*48000/source.sampleRate))return fail('clip outside source or timeline');
   const curve=list(c.gainCurve,ARRANGE_LIMITS.gainPoints).map(v=>{const p=object(v,['at','db']);return{at:number(p.at,0,length,true),db:number(p.db,-60,12)};}).sort((a,b)=>a.at-b.at);
   if(curve.some((p,i)=>i>0&&p.at===curve[i-1].at))return fail('duplicate automation point');
   return{id:id(c.id),sourceId:source.id,start,offset,length,gainDb:number(c.gainDb,-60,12),fadeIn:number(c.fadeIn,0,length,true),fadeOut:number(c.fadeOut,0,length,true),gainCurve:curve,muted:c.muted,pan:number(c.pan,-1,1),fadeShape:c.fadeShape as ArrangeClip['fadeShape'],name:clipName(c.name)};
  });return{id:id(t.id),name:text(t.name),gainDb:number(t.gainDb,-60,12),pan:number(t.pan,-1,1),mute:t.mute,solo:t.solo,rack:validateRack(t.rack),clips};
 });
 const markers=list(o.markers,128).map(v=>{const m=object(v,['id','name','frame']);return{id:id(m.id),name:text(m.name),frame:number(m.frame,0,max,true)};});
 let loop:Arrangement['loop']=null;if(o.loop!==null){const r=object(o.loop,['start','end']);loop={start:number(r.start,0,max-1,true),end:number(r.end,1,max,true)};if(loop.end<=loop.start)return fail('loop range');}
 return{version:9,masterRack:validateRack(o.masterRack),name:text(o.name),sampleRate:48000,sources,tracks,markers,loop,tailFrames:number(o.tailFrames,0,48000*ARRANGE_LIMITS.tailSeconds,true),bpm:number(o.bpm,20,300)};
}
export const serializeArrangement=(s:Arrangement)=>JSON.stringify(validateArrangement(s));
export const parseArrangement=(text:string):Arrangement=>{if(text.length>256_000)throw Error('Sound session document is too large');return validateArrangement(JSON.parse(text));};
export const arrangementEnd=(s:Arrangement)=>Math.max(0,...s.tracks.flatMap(t=>t.clips.map(c=>c.start+c.length)));
export const sourceTimelineFrames=(s:AudioSourceRef)=>Math.floor(s.frames*48000/s.sampleRate);
export const newTrack=(id:string,name:string):ArrangeTrack=>({id,name,gainDb:0,pan:0,mute:false,solo:false,rack:emptyRack(),clips:[]});
export const newClip=(id:string,source:AudioSourceRef,start=0):ArrangeClip=>({id,sourceId:source.id,start,offset:0,length:sourceTimelineFrames(source),gainDb:0,fadeIn:0,fadeOut:0,gainCurve:[],muted:false,pan:0,fadeShape:'linear',name:''});
/** Toggling the loop: clears an active one; otherwise loops the selected output range, or the whole session when no range is set. */
export const loopToggle=(current:Arrangement['loop'],range:{start:number;end:number}|null,sessionEnd:number):{start:number;end:number}|null=>current?null:range??(sessionEnd>0?{start:0,end:sessionEnd}:null);
/** The automated level (dB) at a clip-local frame: constant outside the outermost points, linear in dB between points. */
/** Shapes a normalized fade position (0 silent, 1 full). linear: x; equalPower: sin(x*pi/2), so equal-power crossfades sum to unity power. */
export const fadeShapeAt=(shape:ArrangeClip['fadeShape'],x:number)=>shape==='equalPower'?Math.sin(Math.max(0,Math.min(1,x))*Math.PI/2):Math.max(0,Math.min(1,x));
export const gainCurveAt=(clip:ArrangeClip,local:number)=>{const c=clip.gainCurve;if(!c.length)return 0;if(local<=c[0].at)return c[0].db;for(let i=1;i<c.length;i++)if(local<=c[i].at){const a=c[i-1],b=c[i];return a.db+(b.db-a.db)*(local-a.at)/(b.at-a.at);}return c[c.length-1].db;};
/** History owns deep copies; failed mutations never change the document or history. */
export class ArrangementHistory{
 private current:Arrangement;private past:Arrangement[]=[];private future:Arrangement[]=[];revision=0;
 constructor(initial:Arrangement){this.current=validateArrangement(initial);}
 get snapshot(){return validateArrangement(this.current);}
 get canUndo(){return this.past.length>0;}get canRedo(){return this.future.length>0;}
 change(edit:(draft:Arrangement)=>void){const next=this.snapshot;edit(next);const valid=validateArrangement(next);if(serializeArrangement(valid)===serializeArrangement(this.current))return false;this.past.push(this.current);if(this.past.length>ARRANGE_LIMITS.history)this.past.shift();this.current=valid;this.future=[];this.revision++;return true;}
 undo(){const previous=this.past.pop();if(!previous)return false;this.future.push(this.current);this.current=previous;this.revision++;return true;}
 redo(){const next=this.future.pop();if(!next)return false;this.past.push(this.current);this.current=next;this.revision++;return true;}
 replace(next:Arrangement){const valid=validateArrangement(next);this.current=valid;this.past=[];this.future=[];this.revision++;}
}
/** Finds a staggered overlap between a clip and a neighbour on its track: the earlier clip ends strictly inside the later one. Containment and mere touching return null - no honest crossfade region exists there. */
export function findCrossfadePair(s:Arrangement,clipId:string){const {track,clip}=findArrangeClip(s,clipId);for(const other of track.clips){if(other.id===clip.id)continue;const earlier=clip.start<other.start?clip:other,later=clip.start<other.start?other:clip,eEnd=earlier.start+earlier.length,lEnd=later.start+later.length;if(earlier.start<later.start&&later.start<eEnd&&eEnd<lEnd)return{earlier,later,overlap:eEnd-later.start};}return null;}
/** Complementary equal-power fades over the overlap: constant power for the pair. */
export function applyCrossfade(s:Arrangement,clipId:string){const pair=findCrossfadePair(s,clipId);if(!pair)throw Error('No staggered overlap on this track');pair.earlier.fadeOut=pair.overlap;pair.earlier.fadeShape='equalPower';pair.later.fadeIn=pair.overlap;pair.later.fadeShape='equalPower';return pair;}
/** Peak over the clip's used source region, from the cached min/max waveform columns of the source. */
export function clipRegionPeak(peaks:ArrayLike<number>,offset:number,length:number,totalTimelineFrames:number):number{
 if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||length<1||totalTimelineFrames<1)throw Error('Invalid clip region');
 const cols=Math.floor(peaks.length/2);if(cols<1)throw Error('No waveform peaks');
 const from=Math.max(0,Math.floor(offset/totalTimelineFrames*cols)),to=Math.min(cols,Math.ceil((offset+length)/totalTimelineFrames*cols));
 let peak=0;for(let c=from;c<to;c++)peak=Math.max(peak,Math.abs(peaks[c*2]),Math.abs(peaks[c*2+1]));
 return peak;
}
/** Gain in dB that brings a region peak to the target, clamped to the clip gain range. Silent regions are rejected instead of blasting gain into noise. */
export function normalizeGainDb(peak:number,targetDb=0):number{
 if(!Number.isFinite(peak)||peak<=0)throw Error('Clip region is silent');
 if(!Number.isFinite(targetDb)||targetDb<-60||targetDb>12)throw Error('Invalid normalize target');
 return Math.round(Math.max(-60,Math.min(12,targetDb-20*Math.log10(peak)))*10)/10;
}
/** Field patch that trims the clip start to a frame inside it: the source offset follows the cut and the gain curve re-bases with the interpolated cut level at 0. Same rule as split: the cut edge starts clean (fade-in 0), the outer fade clamps to the new length. */
export function trimStartPatch(clip:ArrangeClip,frame:number){if(!Number.isSafeInteger(frame)||frame<=clip.start||frame>=clip.start+clip.length)throw Error('Trim point must be inside the clip');const cut=frame-clip.start,length=clip.length-cut;
 const gainCurve=clip.gainCurve.length?[{at:0,db:gainCurveAt(clip,cut)},...clip.gainCurve.filter(p=>p.at>cut).map(p=>({at:p.at-cut,db:p.db}))]:[];
 return{start:frame,offset:clip.offset+cut,length,fadeIn:0,fadeOut:Math.min(clip.fadeOut,length),gainCurve};}
/** Field patch that trims the clip end: same rule as split - the cut edge ends clean (fade-out 0), the fade-in clamps and the gain curve ends on the interpolated cut level. */
export function trimEndPatch(clip:ArrangeClip,frame:number){if(!Number.isSafeInteger(frame)||frame<=clip.start||frame>=clip.start+clip.length)throw Error('Trim point must be inside the clip');const length=frame-clip.start;
 const gainCurve=clip.gainCurve.length?[...clip.gainCurve.filter(p=>p.at<length),{at:length,db:gainCurveAt(clip,length)}]:[];
 return{length,fadeIn:Math.min(clip.fadeIn,length),fadeOut:0,gainCurve};}
export function findArrangeClip(s:Arrangement,id:string){for(const track of s.tracks){const clip=track.clips.find(c=>c.id===id);if(clip)return{track,clip};}throw Error('Audio clip no longer exists');}
/** Deletes the given clips and closes their gaps on the same track: every later clip shifts left by the total deleted length that fully precedes it. Markers and the session length stay untouched. */
export function rippleDeleteClips(s:Arrangement,ids:string[]){
 if(!ids.length||ids.some(v=>typeof v!=='string'))throw Error('No clips selected');
 for(const id of ids)findArrangeClip(s,id);
 for(const track of s.tracks){
  const gone=track.clips.filter(c=>ids.includes(c.id)).map(c=>({start:c.start,end:c.start+c.length})).sort((a,b)=>a.start-b.start);
  if(!gone.length)continue;
  track.clips=track.clips.filter(c=>!ids.includes(c.id));
  for(const clip of track.clips){let shift=0;for(const g of gone)if(g.end<=clip.start)shift+=g.end-g.start;clip.start-=shift;}
 }
}
/** A split preserves source position, gain and outer fades. Fades intersecting the split are shortened. */
export function splitArrangeClip(s:Arrangement,id:string,frame:number,rightId:string){const {track,clip}=findArrangeClip(s,id);const left=frame-clip.start;if(!Number.isSafeInteger(frame)||left<=0||left>=clip.length)throw Error('Split must be inside the clip');const oldLength=clip.length;track.clips.push({...clip,id:rightId,start:frame,offset:clip.offset+left,length:oldLength-left,fadeIn:0,fadeOut:Math.min(clip.fadeOut,oldLength-left)});clip.length=left;clip.fadeIn=Math.min(clip.fadeIn,left);clip.fadeOut=0;
 // Automation points live on the clip-local clock: both halves carry the cut's interpolated level at the boundary.
 if(clip.gainCurve.length){const cutDb=gainCurveAt(clip,left),right=track.clips[track.clips.length-1];right.gainCurve=[{at:0,db:cutDb},...clip.gainCurve.filter(p=>p.at>left).map(p=>({at:p.at-left,db:p.db}))];clip.gainCurve=[...clip.gainCurve.filter(p=>p.at<left),{at:left,db:cutDb}];}}
