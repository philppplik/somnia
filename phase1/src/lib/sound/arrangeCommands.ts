import {validateRack} from './rack';
import {t} from '../i18n';
import {registerCommandSpec} from '../commandBridge';
import type {CommandSpec} from '../commandSpec';
import {editArrangement,undoArrangement,redoArrangement,getArrangementState,setRangeSelection,renderSession,exportArrangement,downloadArrangement,saveArrangementNative,previewMaster,acceptMasterPreview,cancelMasterPreview} from './arrangeStore';
import {applyCrossfade,findArrangeClip,splitArrangeClip,newTrack,ARRANGE_LIMITS} from './arrangement';
const schema=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const str={type:'string'},num={type:'number'},bool={type:'boolean'};
const id=()=>`arrange-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
export function registerArrangeCommands(){
 const add=(command:string,run:(p:any)=>unknown,params:Record<string,unknown>=schema({})):CommandSpec<any,unknown>=>({id:`sound.arrange.${command}`,title:t(`sound.arrange.command.${command}`),category:'Tools',level:'ui',params,run,enabled:()=>!getArrangementState().busy});
 const specs=[
 add('rename',p=>editArrangement(s=>{s.name=p.name;}),schema({name:str})),
 add('track.add',()=>editArrangement(s=>s.tracks.push(newTrack(id(),`Track ${s.tracks.length+1}`)))),
 add('track.set',p=>editArrangement(s=>{const t=s.tracks.find(t=>t.id===p.id);if(!t)throw Error('Track no longer exists');for(const k of ['gainDb','pan','mute','solo','name'] as const)if(p[k]!==undefined)(t as any)[k]=p[k];}),schema({id:str,gainDb:num,pan:num,mute:bool,solo:bool,name:str},['id'])),
 add('track.move',p=>editArrangement(s=>{const i=s.tracks.findIndex(t=>t.id===p.id);if(i<0)throw Error('Track no longer exists');const j=i+Math.sign(Number(p.delta));if(j<0||j>=s.tracks.length)return;[s.tracks[i],s.tracks[j]]=[s.tracks[j],s.tracks[i]];}),schema({id:str,delta:num})),
 add('track.duplicate',p=>editArrangement(s=>{const i=s.tracks.findIndex(t=>t.id===p.id);if(i<0)throw Error('Track no longer exists');const source=s.tracks[i];s.tracks.splice(i+1,0,{...source,id:id(),clips:source.clips.map(c=>({...c,id:id()}))});}),schema({id:str})),
 add('track.delete',p=>editArrangement(s=>{if(!s.tracks.some(t=>t.id===p.id))throw Error('Track no longer exists');s.tracks=s.tracks.filter(t=>t.id!==p.id);}),schema({id:str})),
 add('clip.set',p=>editArrangement(s=>{const {clip,track}=findArrangeClip(s,p.id);for(const k of ['start','offset','length','gainDb','fadeIn','fadeOut'] as const)if(p[k]!==undefined)clip[k]=p[k];if(p.muted!==undefined)clip.muted=p.muted;if(p.pan!==undefined)clip.pan=p.pan;if(p.fadeShape!==undefined){if(p.fadeShape!=='linear'&&p.fadeShape!=='equalPower')throw Error('Unknown fade shape');clip.fadeShape=p.fadeShape;}if(p.trackId&&p.trackId!==track.id){const target=s.tracks.find(t=>t.id===p.trackId);if(!target)throw Error('Target track no longer exists');track.clips=track.clips.filter(c=>c.id!==clip.id);target.clips.push(clip);}}),schema({id:str,start:num,offset:num,length:num,gainDb:num,fadeIn:num,fadeOut:num,trackId:str,muted:bool,pan:num,fadeShape:str},['id'])),
 add('clip.curve',p=>editArrangement(s=>{const {clip}=findArrangeClip(s,p.id);clip.gainCurve=p.points;}),schema({id:str,points:{type:'array'}})),
 add('clip.split',p=>editArrangement(s=>splitArrangeClip(s,p.id,p.frame,id())),schema({id:str,frame:num})),
 add('clip.duplicate',p=>editArrangement(s=>{const {track,clip}=findArrangeClip(s,p.id);track.clips.push({...clip,id:id(),start:clip.start+clip.length});}),schema({id:str})),
 add('clip.crossfade',p=>editArrangement(s=>{applyCrossfade(s,p.id);}),schema({id:str})),
 add('clip.delete',p=>editArrangement(s=>{const {track}=findArrangeClip(s,p.id);track.clips=track.clips.filter(c=>c.id!==p.id);}),schema({id:str})),
 add('marker.add',p=>editArrangement(s=>s.markers.push({id:id(),name:p.name,frame:p.frame})),schema({name:str,frame:num})),
 add('marker.delete',p=>editArrangement(s=>{s.markers=s.markers.filter(m=>m.id!==p.id);}),schema({id:str})),
 add('loop.set',p=>editArrangement(s=>{s.loop=p.enabled?{start:p.start,end:p.end}:null;}),schema({enabled:bool,start:num,end:num})),
 add('session.range',p=>setRangeSelection(p.clear?null:{start:p.start,end:p.end}),schema({start:num,end:num,clear:bool},[])),
 add('session.tail',p=>editArrangement(s=>{s.tailFrames=Math.round(Math.min(ARRANGE_LIMITS.tailSeconds,Math.max(0,Number(p.seconds)))*48000);}),schema({seconds:num})),
 add('rack.set',p=>editArrangement(s=>{const rack=validateRack(p.rack);if(p.target==='master')s.masterRack=rack;else{const track=s.tracks.find(t=>t.id===p.target);if(!track)throw Error('Rack target no longer exists');track.rack=rack;}}),schema({target:str,rack:{type:'object'}})),
 add('master.preview',p=>previewMaster(p),schema({lufs:num,ceilingDb:num,limit:bool})),add('master.accept',acceptMasterPreview),add('master.cancel',cancelMasterPreview),
 add('undo',undoArrangement),add('redo',redoArrangement),add('render',renderSession),add('export',exportArrangement),add('save',downloadArrangement),add('saveNative',saveArrangementNative)
 ];const off=specs.map(spec=>registerCommandSpec(spec));return()=>off.forEach(f=>f());
}
