import {emptyRack,validateRack,type EffectRack} from './rack';
/** Dependency-free Sound session document. Time is integer session-rate frames, not pixels. */
export const ARRANGE_LIMITS={tracks:8,clips:128,sources:32,seconds:120,sourceFrames:12_000_000,history:50,tailSeconds:10,gainPoints:32} as const;
export interface AudioSourceRef{id:string;name:string;frames:number;sampleRate:number;channels:1|2}
/** One gain automation point: clip-local frame and level in dB. Points are sorted, unique per position, linear in dB between points. */
export interface GainPoint{at:number;db:number}
export interface ArrangeClip{id:string;sourceId:string;start:number;offset:number;length:number;gainDb:number;fadeIn:number;fadeOut:number;gainCurve:GainPoint[]}
export interface ArrangeTrack{id:string;name:string;gainDb:number;pan:number;mute:boolean;solo:boolean;rack:EffectRack;clips:ArrangeClip[]}
export interface ArrangeMarker{id:string;name:string;frame:number}
/** tailFrames: explicit bounded effect tail appended past the last clip so reverb/delay can ring out; 0 keeps the B1 session boundary. */
export interface Arrangement{version:4;masterRack:EffectRack;name:string;sampleRate:48000;sources:AudioSourceRef[];tracks:ArrangeTrack[];markers:ArrangeMarker[];loop:{start:number;end:number}|null;tailFrames:number}
export function emptyArrangement(name='Untitled session'):Arrangement{return{version:4,masterRack:emptyRack(),name,sampleRate:48000,sources:[],tracks:[],markers:[],loop:null,tailFrames:0};}
const fail=(s:string):never=>{throw Error(`Invalid Sound session: ${s}`);};
const object=(v:unknown,keys:string[]):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))return fail('object expected');const o=v as Record<string,unknown>;if(Object.keys(o).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(o,k)))return fail('unknown or missing field');return o;};
const text=(v:unknown,max=160):string=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\x00-\x1f]/.test(v)?v:fail('text');
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
 const o=object(raw,['version','name','sampleRate','sources','tracks','markers','loop','masterRack','tailFrames']);if(o.version!==4||o.sampleRate!==48000)return fail('version or sample rate');
 const ids=new Set<string>();const id=(v:unknown)=>{const s=text(v,100);if(ids.has(s))return fail('duplicate identity');ids.add(s);return s;};
 const sources=list(o.sources,ARRANGE_LIMITS.sources).map(v=>{const s=object(v,['id','name','frames','sampleRate','channels']);return{id:id(s.id),name:text(s.name),frames:number(s.frames,1,ARRANGE_LIMITS.sourceFrames,true),sampleRate:number(s.sampleRate,8000,192000,true),channels:number(s.channels,1,2,true) as 1|2};});
 if(sources.reduce((n,s)=>n+s.frames*s.channels,0)>ARRANGE_LIMITS.sourceFrames)return fail('source memory budget');
 const max=48000*ARRANGE_LIMITS.seconds;let count=0;
 const tracks=list(o.tracks,ARRANGE_LIMITS.tracks).map(v=>{const t=object(v,['id','name','gainDb','pan','mute','solo','clips','rack']);if(typeof t.mute!=='boolean'||typeof t.solo!=='boolean')return fail('track flags');
  const clips=list(t.clips,ARRANGE_LIMITS.clips).map(v=>{if(++count>ARRANGE_LIMITS.clips)return fail('clip limit');const c=object(v,['id','sourceId','start','offset','length','gainDb','fadeIn','fadeOut','gainCurve']);const source=sources.find(s=>s.id===c.sourceId);if(!source)return fail('missing source reference');
   const start=number(c.start,0,max-1,true),offset=number(c.offset,0,max,true),length=number(c.length,1,max,true);if(start+length>max||offset+length>Math.floor(source.frames*48000/source.sampleRate))return fail('clip outside source or timeline');
   const curve=list(c.gainCurve,ARRANGE_LIMITS.gainPoints).map(v=>{const p=object(v,['at','db']);return{at:number(p.at,0,length,true),db:number(p.db,-60,12)};}).sort((a,b)=>a.at-b.at);
   if(curve.some((p,i)=>i>0&&p.at===curve[i-1].at))return fail('duplicate automation point');
   return{id:id(c.id),sourceId:source.id,start,offset,length,gainDb:number(c.gainDb,-60,12),fadeIn:number(c.fadeIn,0,length,true),fadeOut:number(c.fadeOut,0,length,true),gainCurve:curve};
  });return{id:id(t.id),name:text(t.name),gainDb:number(t.gainDb,-60,12),pan:number(t.pan,-1,1),mute:t.mute,solo:t.solo,rack:validateRack(t.rack),clips};
 });
 const markers=list(o.markers,128).map(v=>{const m=object(v,['id','name','frame']);return{id:id(m.id),name:text(m.name),frame:number(m.frame,0,max,true)};});
 let loop:Arrangement['loop']=null;if(o.loop!==null){const r=object(o.loop,['start','end']);loop={start:number(r.start,0,max-1,true),end:number(r.end,1,max,true)};if(loop.end<=loop.start)return fail('loop range');}
 return{version:4,masterRack:validateRack(o.masterRack),name:text(o.name),sampleRate:48000,sources,tracks,markers,loop,tailFrames:number(o.tailFrames,0,48000*ARRANGE_LIMITS.tailSeconds,true)};
}
export const serializeArrangement=(s:Arrangement)=>JSON.stringify(validateArrangement(s));
export const parseArrangement=(text:string):Arrangement=>{if(text.length>256_000)throw Error('Sound session document is too large');return validateArrangement(JSON.parse(text));};
export const arrangementEnd=(s:Arrangement)=>Math.max(0,...s.tracks.flatMap(t=>t.clips.map(c=>c.start+c.length)));
export const sourceTimelineFrames=(s:AudioSourceRef)=>Math.floor(s.frames*48000/s.sampleRate);
export const newTrack=(id:string,name:string):ArrangeTrack=>({id,name,gainDb:0,pan:0,mute:false,solo:false,rack:emptyRack(),clips:[]});
export const newClip=(id:string,source:AudioSourceRef,start=0):ArrangeClip=>({id,sourceId:source.id,start,offset:0,length:sourceTimelineFrames(source),gainDb:0,fadeIn:0,fadeOut:0,gainCurve:[]});
/** The automated level (dB) at a clip-local frame: constant outside the outermost points, linear in dB between points. */
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
export function findArrangeClip(s:Arrangement,id:string){for(const track of s.tracks){const clip=track.clips.find(c=>c.id===id);if(clip)return{track,clip};}throw Error('Audio clip no longer exists');}
/** A split preserves source position, gain and outer fades. Fades intersecting the split are shortened. */
export function splitArrangeClip(s:Arrangement,id:string,frame:number,rightId:string){const {track,clip}=findArrangeClip(s,id);const left=frame-clip.start;if(!Number.isSafeInteger(frame)||left<=0||left>=clip.length)throw Error('Split must be inside the clip');const oldLength=clip.length;track.clips.push({...clip,id:rightId,start:frame,offset:clip.offset+left,length:oldLength-left,fadeIn:0,fadeOut:Math.min(clip.fadeOut,oldLength-left)});clip.length=left;clip.fadeIn=Math.min(clip.fadeIn,left);clip.fadeOut=0;
 // Automation points live on the clip-local clock: both halves carry the cut's interpolated level at the boundary.
 if(clip.gainCurve.length){const cutDb=gainCurveAt(clip,left),right=track.clips[track.clips.length-1];right.gainCurve=[{at:0,db:cutDb},...clip.gainCurve.filter(p=>p.at>left).map(p=>({at:p.at-left,db:p.db}))];clip.gainCurve=[...clip.gainCurve.filter(p=>p.at<left),{at:left,db:cutDb}];}}
