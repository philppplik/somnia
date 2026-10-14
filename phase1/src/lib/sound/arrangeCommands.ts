import {t} from '../i18n';
import {registerCommandSpec} from '../commandBridge';
import type {CommandSpec} from '../commandSpec';
import {editArrangement,undoArrangement,redoArrangement,getArrangementState,renderSession,exportArrangement,downloadArrangement} from './arrangeStore';
import {findArrangeClip,splitArrangeClip,newTrack} from './arrangement';
const schema=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const str={type:'string'},num={type:'number'},bool={type:'boolean'};
const id=()=>`arrange-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
export function registerArrangeCommands(){
 const add=(command:string,run:(p:any)=>unknown,params:Record<string,unknown>=schema({})):CommandSpec<any,unknown>=>({id:`sound.arrange.${command}`,title:t(`sound.arrange.command.${command}`),category:'Tools',level:'ui',params,run,enabled:()=>!getArrangementState().busy});
 const specs=[
 add('rename',p=>editArrangement(s=>{s.name=p.name;}),schema({name:str})),
 add('track.add',()=>editArrangement(s=>s.tracks.push(newTrack(id(),`Track ${s.tracks.length+1}`)))),
 add('track.set',p=>editArrangement(s=>{const t=s.tracks.find(t=>t.id===p.id);if(!t)throw Error('Track no longer exists');for(const k of ['gainDb','pan','mute','solo','name'] as const)if(p[k]!==undefined)(t as any)[k]=p[k];}),schema({id:str,gainDb:num,pan:num,mute:bool,solo:bool,name:str},['id'])),
 add('clip.set',p=>editArrangement(s=>{const {clip,track}=findArrangeClip(s,p.id);for(const k of ['start','offset','length','gainDb','fadeIn','fadeOut'] as const)if(p[k]!==undefined)clip[k]=p[k];if(p.trackId&&p.trackId!==track.id){const target=s.tracks.find(t=>t.id===p.trackId);if(!target)throw Error('Target track no longer exists');track.clips=track.clips.filter(c=>c.id!==clip.id);target.clips.push(clip);}}),schema({id:str,start:num,offset:num,length:num,gainDb:num,fadeIn:num,fadeOut:num,trackId:str},['id'])),
 add('clip.split',p=>editArrangement(s=>splitArrangeClip(s,p.id,p.frame,id())),schema({id:str,frame:num})),
 add('clip.duplicate',p=>editArrangement(s=>{const {track,clip}=findArrangeClip(s,p.id);track.clips.push({...clip,id:id(),start:clip.start+clip.length});}),schema({id:str})),
 add('clip.delete',p=>editArrangement(s=>{const {track}=findArrangeClip(s,p.id);track.clips=track.clips.filter(c=>c.id!==p.id);}),schema({id:str})),
 add('marker.add',p=>editArrangement(s=>s.markers.push({id:id(),name:p.name,frame:p.frame})),schema({name:str,frame:num})),
 add('marker.delete',p=>editArrangement(s=>{s.markers=s.markers.filter(m=>m.id!==p.id);}),schema({id:str})),
 add('loop.set',p=>editArrangement(s=>{s.loop=p.enabled?{start:p.start,end:p.end}:null;}),schema({enabled:bool,start:num,end:num})),
 add('undo',undoArrangement),add('redo',redoArrangement),add('render',renderSession),add('export',exportArrangement),add('save',downloadArrangement)
 ];const off=specs.map(spec=>registerCommandSpec(spec));return()=>off.forEach(f=>f());
}
