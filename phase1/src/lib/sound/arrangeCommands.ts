import {validateRack} from './rack';
import {t} from '../i18n';
import {registerCommandSpec} from '../commandBridge';
import type {CommandSpec} from '../commandSpec';
import {editArrangement,undoArrangement,redoArrangement,getArrangementState,setRangeSelection,renderSession,exportArrangement,downloadArrangement,saveArrangementNative,previewMaster,acceptMasterPreview,cancelMasterPreview} from './arrangeStore';
import {applyCrossfade,clipRegionPeak,cutSessionRange,findArrangeClip,normalizeGainDb,normalizeSelection,rippleDeleteClips,splitArrangeClip,newTrack,ARRANGE_LIMITS} from './arrangement';
const schema=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const str={type:'string'},num={type:'number'},bool={type:'boolean'};
const id=()=>`arrange-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
let clipClipboard:{clip:ReturnType<typeof findArrangeClip>['clip'];trackId:string}|null=null;
/** Whether a clip waits on the internal clipboard (one slot, session-wide). */
export function hasClipClipboard(){return clipClipboard!==null;}

export function registerArrangeCommands(){
 const add=(command:string,run:(p:any)=>unknown,params:Record<string,unknown>=schema({})):CommandSpec<any,unknown>=>({id:`sound.arrange.${command}`,title:t(`sound.arrange.command.${command}`),category:'Tools',level:'ui',params,run,enabled:()=>!getArrangementState().busy});
 const specs=[
 add('rename',p=>editArrangement(s=>{s.name=p.name;}),schema({name:str})),
 add('track.add',()=>editArrangement(s=>s.tracks.push(newTrack(id(),`Track ${s.tracks.length+1}`)))),
 add('track.set',p=>editArrangement(s=>{const t=s.tracks.find(t=>t.id===p.id);if(!t)throw Error('Track no longer exists');for(const k of ['gainDb','pan','mute','solo','name'] as const)if(p[k]!==undefined)(t as any)[k]=p[k];}),schema({id:str,gainDb:num,pan:num,mute:bool,solo:bool,name:str},['id'])),
 add('track.move',p=>editArrangement(s=>{const i=s.tracks.findIndex(t=>t.id===p.id);if(i<0)throw Error('Track no longer exists');const j=i+Math.sign(Number(p.delta));if(j<0||j>=s.tracks.length)return;[s.tracks[i],s.tracks[j]]=[s.tracks[j],s.tracks[i]];}),schema({id:str,delta:num})),
 add('track.duplicate',p=>editArrangement(s=>{const i=s.tracks.findIndex(t=>t.id===p.id);if(i<0)throw Error('Track no longer exists');const source=s.tracks[i];s.tracks.splice(i+1,0,{...source,id:id(),clips:source.clips.map(c=>({...c,id:id()}))});}),schema({id:str})),
 add('track.delete',p=>editArrangement(s=>{if(!s.tracks.some(t=>t.id===p.id))throw Error('Track no longer exists');s.tracks=s.tracks.filter(t=>t.id!==p.id);}),schema({id:str})),
 add('clip.set',p=>editArrangement(s=>{const {clip,track}=findArrangeClip(s,p.id);for(const k of ['start','offset','length','gainDb','fadeIn','fadeOut'] as const)if(p[k]!==undefined)clip[k]=p[k];if(p.muted!==undefined)clip.muted=p.muted;if(p.name!==undefined)clip.name=p.name;if(p.pan!==undefined)clip.pan=p.pan;if(p.fadeShape!==undefined){if(p.fadeShape!=='linear'&&p.fadeShape!=='equalPower')throw Error('Unknown fade shape');clip.fadeShape=p.fadeShape;}if(p.trackId&&p.trackId!==track.id){const target=s.tracks.find(t=>t.id===p.trackId);if(!target)throw Error('Target track no longer exists');track.clips=track.clips.filter(c=>c.id!==clip.id);target.clips.push(clip);}}),schema({id:str,start:num,offset:num,length:num,gainDb:num,fadeIn:num,fadeOut:num,trackId:str,muted:bool,pan:num,fadeShape:str,name:str},['id'])),
 add('clip.curve',p=>editArrangement(s=>{const {clip}=findArrangeClip(s,p.id);clip.gainCurve=p.points;}),schema({id:str,points:{type:'array'}})),
 add('clip.split',p=>editArrangement(s=>splitArrangeClip(s,p.id,p.frame,id())),schema({id:str,frame:num})),
 add('clip.duplicate',p=>editArrangement(s=>{const {track,clip}=findArrangeClip(s,p.id);track.clips.push({...clip,id:id(),start:clip.start+clip.length});}),schema({id:str})),
 add('clips.normalize',p=>editArrangement(s=>normalizeSelection(s,p.ids as string[],getArrangementState().sourcePeaks,p.targetDb as number|undefined)),schema({ids:{type:'array'},targetDb:num},['ids'])),
 add('clip.normalize',p=>editArrangement(s=>{const {clip}=findArrangeClip(s,p.id);const source=s.sources.find(src=>src.id===clip.sourceId)!;const peaks=getArrangementState().sourcePeaks[source.id];if(!peaks)throw Error('Source waveform peaks are not available yet');clip.gainDb=normalizeGainDb(clipRegionPeak(peaks,clip.offset,clip.length,Math.floor(source.frames*48000/source.sampleRate)),p.targetDb??0);}),schema({id:str,targetDb:num},['id'])),
 add('clip.copy',p=>{const {clip,track}=findArrangeClip(getArrangementState().document,p.id);clipClipboard={clip:JSON.parse(JSON.stringify(clip)),trackId:track.id};},schema({id:str})),
 add('clip.paste',p=>editArrangement(s=>{if(!clipClipboard)throw Error('Clipboard is empty');const track=s.tracks.find(t=>t.id===(p.trackId??clipClipboard!.trackId));if(!track)throw Error('Target track no longer exists');track.clips.push({...JSON.parse(JSON.stringify(clipClipboard!.clip)),id:id(),start:p.frame});}),schema({frame:num,trackId:str},['frame'])),
 add('clips.move',p=>editArrangement(s=>{const ids=p.ids as string[];if(!ids.length||ids.some(v=>typeof v!=='string'))throw Error('No clips selected');for(const cid of ids)findArrangeClip(s,cid);for(const cid of ids){const {clip}=findArrangeClip(s,cid);clip.start=Math.max(0,clip.start+p.delta);}}),schema({ids:{type:'array'},delta:num})),
 add('clips.mute',p=>editArrangement(s=>{const ids=p.ids as string[];if(!ids.length||ids.some(v=>typeof v!=='string'))throw Error('No clips selected');for(const cid of ids)findArrangeClip(s,cid).clip.muted=!!p.muted;}),schema({ids:{type:'array'},muted:bool})),
 add('clips.duplicate',p=>editArrangement(s=>{const ids=p.ids as string[];if(!ids.length||ids.some(v=>typeof v!=='string'))throw Error('No clips selected');for(const cid of ids)findArrangeClip(s,cid);for(const t of s.tracks)for(const c of t.clips.filter(c=>ids.includes(c.id)))t.clips.push({...c,id:id(),start:c.start+c.length});}),schema({ids:{type:'array'}})),
 add('clips.rippleDelete',p=>editArrangement(s=>rippleDeleteClips(s,p.ids as string[])),schema({ids:{type:'array'}})),
 add('clips.delete',p=>editArrangement(s=>{const ids=p.ids as string[];if(!ids.length||ids.some(v=>typeof v!=='string'))throw Error('No clips selected');for(const cid of ids)findArrangeClip(s,cid);for(const t of s.tracks)t.clips=t.clips.filter(c=>!ids.includes(c.id));}),schema({ids:{type:'array'}})),
 add('clip.crossfade',p=>editArrangement(s=>{applyCrossfade(s,p.id);}),schema({id:str})),
 add('clip.delete',p=>editArrangement(s=>{const {track}=findArrangeClip(s,p.id);track.clips=track.clips.filter(c=>c.id!==p.id);}),schema({id:str})),
 add('marker.add',p=>editArrangement(s=>s.markers.push({id:id(),name:p.name,frame:p.frame})),schema({name:str,frame:num})),
 add('marker.set',p=>editArrangement(s=>{const m=s.markers.find(m=>m.id===p.id);if(!m)throw Error('Marker no longer exists');m.name=p.name;}),schema({id:str,name:str})),
 add('marker.delete',p=>editArrangement(s=>{s.markers=s.markers.filter(m=>m.id!==p.id);}),schema({id:str})),
 add('loop.set',p=>editArrangement(s=>{s.loop=p.enabled?{start:p.start,end:p.end}:null;}),schema({enabled:bool,start:num,end:num})),
 add('session.setBpm',p=>editArrangement(s=>{s.bpm=Math.round(p.bpm*10)/10;}),schema({bpm:num})),
 add('session.splitAtMarkers',()=>editArrangement(s=>{if(!s.markers.length)throw Error('No markers');let n=0;for(const m of [...s.markers].sort((a,b)=>a.frame-b.frame))for(const track of s.tracks){const clip=track.clips.find(c=>m.frame>c.start&&m.frame<c.start+c.length);if(clip){splitArrangeClip(s,clip.id,m.frame,id());n++;}}if(!n)throw Error('No clip at any marker');}),schema({})),
 add('session.cutRange',p=>editArrangement(s=>cutSessionRange(s,p.start,p.end,id)),schema({start:num,end:num})),
 add('session.splitAt',p=>editArrangement(s=>{let n=0;for(const track of s.tracks)for(const clip of [...track.clips])if(p.frame>clip.start&&p.frame<clip.start+clip.length){splitArrangeClip(s,clip.id,p.frame,id());n++;}if(!n)throw Error('No clip at the playhead');}),schema({frame:num})),
 add('session.range',p=>setRangeSelection(p.clear?null:{start:p.start,end:p.end}),schema({start:num,end:num,clear:bool},[])),
 add('session.tail',p=>editArrangement(s=>{s.tailFrames=Math.round(Math.min(ARRANGE_LIMITS.tailSeconds,Math.max(0,Number(p.seconds)))*48000);}),schema({seconds:num})),
 add('rack.set',p=>editArrangement(s=>{const rack=validateRack(p.rack);if(p.target==='master')s.masterRack=rack;else{const track=s.tracks.find(t=>t.id===p.target);if(!track)throw Error('Rack target no longer exists');track.rack=rack;}}),schema({target:str,rack:{type:'object'}})),
 add('master.preview',p=>previewMaster(p),schema({lufs:num,ceilingDb:num,limit:bool})),add('master.accept',acceptMasterPreview),add('master.cancel',cancelMasterPreview),
 add('undo',undoArrangement),add('redo',redoArrangement),add('render',renderSession),add('export',exportArrangement),add('save',downloadArrangement),add('saveNative',saveArrangementNative)
 ];const off=specs.map(spec=>registerCommandSpec(spec));return()=>off.forEach(f=>f());
}
