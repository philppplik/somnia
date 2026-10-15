/** Copy/paste of the culling metadata (rating, flag, color label, tags, caption) between photos, Lightroom-style. The clipboard is session-level (module state, not persisted); paste replaces the targets' metadata. Original files are never touched. */
import {getRating,setRating} from './ratings';
import {getFlag,setFlag,type PhotoFlag} from './flags';
import {getLabel,setLabel,type PhotoLabel} from './labels';
import {getTags,setTags} from './tags';
import {getCaption,setCaption} from './captions';
export interface MetadataClip{rating:number;flag:PhotoFlag|null;label:PhotoLabel|null;tags:string[];caption:string}
let clip:MetadataClip|null=null;
export const copyMetadata=(name:string):MetadataClip=>{clip={rating:getRating(name),flag:getFlag(name),label:getLabel(name),tags:[...getTags(name)],caption:getCaption(name)};return clip;};
export const hasMetadataClip=()=>clip!==null;
export function pasteMetadata(targets:readonly string[]):number{
 if(!clip)return 0;
 const c=clip;
 let n=0;
 for(const name of targets){
  if(!name)continue;
  setRating(name,c.rating);
  setFlag(name,c.flag);
  setLabel(name,c.label);
  setTags(name,c.tags);
  setCaption(name,c.caption);
  n++;
 }
 return n;
}
