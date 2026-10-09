import {editTimeline,selectTimelineClip} from './session';
import {insertClip,insertIndexAfter,newTitleClip,patchTitle,setTitleDuration,type TitleSpec} from './titles';
/** Adds a default title card after the clip under `time` (timeline seconds) and selects it. */
export function addTitleClip(root:string,time:number,spec:Partial<TitleSpec>={}){
 const clip=newTitleClip(spec);
 editTimeline(root,clips=>insertClip(clips,clip,insertIndexAfter(clips,time)));
 selectTimelineClip(root,clip.id);
 return clip.id;
}
export const updateTitle=(root:string,id:string,patch:Partial<TitleSpec>)=>editTimeline(root,clips=>patchTitle(clips,id,patch));
export const setTitleLength=(root:string,id:string,seconds:number)=>editTimeline(root,clips=>setTitleDuration(clips,id,seconds));
