import {registerCommandSpec} from '../commandBridge';
import {commandRegistry} from '../commandRegistry';
import type {CommandSpec,CommandSchema} from '../commandSpec';
import {getMedia} from '../media';
import {addTimelineClip,addTimelineClipsFromDialog,cancelVideoExport,deleteTimelineClip,exportVideoFile,getVideoSession,moveTimelineClip,redoVideoEdit,resetTimeline,saveVideoProject,selectTimelineClip,setTimelineClipCrossfade,setTimelineClipGain,setVideoFormat,splitTimelineAt,toggleTimelineClipMute,trimTimelineClip,undoVideoEdit,videoIsDirty} from './session';
import {addTitleClip,setTitleLength,updateTitle} from './titleSession';
import {isTitleClip,type TitleSpec} from './titles';
import {timelineDuration} from './timeline';
let exportOpener:((name:string)=>void)|null=null;
export function registerVideoExportOpener(open:(name:string)=>void){exportOpener=open;return()=>{if(exportOpener===open)exportOpener=null;};}
export const activeVideoSession=()=>getVideoSession(getMedia().active);
const ready=()=>activeVideoSession()?.status==='ready';
const selected=()=>{const s=activeVideoSession();return s?.clips.find(c=>c.id===s.selectedClipId);};
const fail=(message:string):never=>{throw Object.assign(new Error(message),{expected:true});};
const root=()=>activeVideoSession()?.name??fail('No active video project.');
const clip=()=>selected()??fail('Select a timeline clip first.');
const object=(properties:Record<string,unknown>,required=Object.keys(properties)):CommandSchema=>({type:'object',properties,required,additionalProperties:false});
const number=(minimum=0,maximum=86400)=>({type:'number',minimum,maximum});
const id={type:'string',minLength:1,maxLength:1024};
const titleProperties={text:{type:'string',maxLength:500},size:number(8,600),color:{type:'string',pattern:'^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$'},background:{type:'string',pattern:'^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$'},font:{enum:['sans','serif','mono']},bold:{type:'boolean'},italic:{type:'boolean'},align:{enum:['left','center','right']},vAlign:{enum:['top','middle','bottom']},fadeIn:number(0,10),fadeOut:number(0,10)};
/** Typed interactive specs. File encoding and all edits stay on the existing video session. */
export function videoCommandSpecs():CommandSpec<unknown,unknown>[] {
 const spec=<P,>(id:string,title:string,run:(p:P)=>unknown,params?:CommandSchema,enabled=ready,category:CommandSpec['category']='Tools'):CommandSpec<P,unknown>=>({id,title,category,level:'ui',params,enabled,keywords:['video','timeline'],run});
 const selectionReady=()=>ready()&&!!selected();
 const mediaSelection=()=>selectionReady()&&!isTitleClip(clip());
 const titleSelection=()=>selectionReady()&&isTitleClip(clip());
 return [
  spec('video.source.add','Add an open video to the timeline',async(p:{name:string})=>{const item=getMedia().items.find(i=>i.name===p.name&&i.kind==='video');if(!item)fail('That video source is not open.');await addTimelineClip(root(),item!);},object({name:id})),
  spec('video.source.open','Open and add video clips',()=>addTimelineClipsFromDialog(root())),
  spec('video.clip.select','Select a timeline clip',(p:{id:string})=>{const s=activeVideoSession()!;if(!s.clips.some(c=>c.id===p.id))fail('That clip is not in the active timeline.');selectTimelineClip(s.name,p.id);},object({id}),ready,'View'),
  spec('video.clip.deselect','Clear video clip selection',()=>selectTimelineClip(root(),null),undefined,selectionReady,'View'),
  spec('video.clip.move','Move selected video clip',(p:{by:number})=>moveTimelineClip(root(),clip().id,p.by),object({by:{type:'integer',enum:[-1,1]}}),selectionReady,'Edit'),
  spec('video.clip.delete','Delete selected video clip',()=>deleteTimelineClip(root(),clip().id),undefined,()=>selectionReady()&&(activeVideoSession()!.clips.length>1||getMedia().items.find(i=>i.name===root())?.kind==='video-project'),'Edit'),
  spec('video.clip.trim','Trim selected video clip',(p:{edge:'in'|'out';seconds:number})=>trimTimelineClip(root(),clip().id,p.edge,p.seconds),object({edge:{enum:['in','out']},seconds:number()}),mediaSelection,'Edit'),
  spec('video.clip.gain','Set selected clip audio gain',(p:{gain:number})=>setTimelineClipGain(root(),clip().id,p.gain),object({gain:number(0,2)}),mediaSelection),
  spec('video.clip.mute','Toggle selected clip audio mute',()=>toggleTimelineClipMute(root(),clip().id),undefined,mediaSelection),
  spec('video.clip.crossfade','Set selected clip crossfade',(p:{seconds:number})=>setTimelineClipCrossfade(root(),clip().id,p.seconds),object({seconds:number()}),()=>selectionReady()&&activeVideoSession()!.clips.at(-1)?.id!==clip().id),
  spec('video.timeline.split','Split video timeline at time',(p:{seconds:number})=>{const s=activeVideoSession()!;if(p.seconds>=timelineDuration(s.clips))fail('Split time is outside the timeline.');splitTimelineAt(s.name,p.seconds);},object({seconds:number()}),()=>ready()&&!!activeVideoSession()!.clips.length,'Edit'),
  spec('video.timeline.reset','Reset video timeline',()=>resetTimeline(root()),undefined,ready,'Edit'),
  spec('video.timeline.undo','Undo timeline edit',()=>undoVideoEdit(root()),undefined,()=>ready()&&!!activeVideoSession()!.history.past.length,'Edit'),
  spec('video.timeline.redo','Redo timeline edit',()=>redoVideoEdit(root()),undefined,()=>ready()&&!!activeVideoSession()!.history.future.length,'Edit'),
  spec('video.title.add','Add a title card',()=>addTitleClip(root(),Number.MAX_SAFE_INTEGER,{text:''}),undefined,ready,'Insert'),
  spec('video.title.update','Edit selected title card',(p:Partial<TitleSpec>)=>updateTitle(root(),clip().id,p),object(titleProperties,[]),titleSelection,'Edit'),
  spec('video.title.duration','Set selected title card duration',(p:{seconds:number})=>setTitleLength(root(),clip().id,p.seconds),object({seconds:number(0.05,3600)}),titleSelection,'Edit'),
  spec('video.project.save','Save video project',()=>{if(!saveVideoProject(root()))fail('The project is not ready yet.');},undefined,()=>ready()&&videoIsDirty(activeVideoSession()!),'Project'),
  spec('video.export.open','Review video export',()=>exportOpener!(root()),undefined,()=>!!exportOpener&&!!activeVideoSession(),'Project'),
  spec('video.export.format','Set video export format',(p:{format:'webm'|'mp4'})=>{const caps=activeVideoSession()!.capabilities;if(!(p.format==='webm'?caps?.webmVideo:caps?.mp4Video))fail('This encoder is not available in this browser.');setVideoFormat(root(),p.format);},object({format:{enum:['webm','mp4']}})),
  spec('video.export.start','Export video copy',()=>exportVideoFile(root()),undefined,()=>ready()&&!!activeVideoSession()!.clips.length&&activeVideoSession()!.clips.filter(c=>!isTitleClip(c)).every(c=>getMedia().items.some(i=>i.name===c.source))&&!!(activeVideoSession()!.format==='webm'?activeVideoSession()!.capabilities?.webmVideo:activeVideoSession()!.capabilities?.mp4Video),'Project'),
  spec('video.export.cancel','Cancel video export',()=>cancelVideoExport(root()),undefined,()=>activeVideoSession()?.status==='exporting','Project'),
 ] as CommandSpec<unknown,unknown>[];
}
export const VIDEO_COMMANDS=videoCommandSpecs().map(s=>s.id);
export function registerVideoCommands(){
 const offs=videoCommandSpecs().map(s=>{const off=registerCommandSpec(s);const c=commandRegistry.get(s.id);if(c){c.studio='video';c.argsSchema=s.params;c.risk=s.id.endsWith('.delete')||s.id.endsWith('.reset')?'destructive':s.id.startsWith('video.export.')?'none':'content';}return off;});
 return()=>offs.forEach(off=>off());
}
