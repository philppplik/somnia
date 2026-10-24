/** Copy/paste of the culling metadata (rating, flag, color label, tags, caption) between photos, Lightroom-style. The clipboard is session-level (module state, not persisted); paste replaces the targets' metadata. Original files are never touched. */
import {getRating} from './ratings';
import {getFlag,type PhotoFlag} from './flags';
import {getLabel,type PhotoLabel} from './labels';
import {getTags} from './tags';
import {getCaption} from './captions';
import {cullBatch,cullSetRating,cullSetFlag,cullSetLabel,cullSetTags,cullSetCaption} from './cullHistory';
export interface MetadataClip{rating:number;flag:PhotoFlag|null;label:PhotoLabel|null;tags:string[];caption:string}
let clip:MetadataClip|null=null;
export const copyMetadata=(name:string):MetadataClip=>{clip={rating:getRating(name),flag:getFlag(name),label:getLabel(name),tags:[...getTags(name)],caption:getCaption(name)};return clip;};
export const hasMetadataClip=()=>clip!==null;
export function pasteMetadata(targets:readonly string[]):number{
 if(!clip)return 0;
 const c=clip;
 let n=0;
 cullBatch(()=>{
  for(const name of targets){
   if(!name)continue;
   cullSetRating(name,c.rating);
   cullSetFlag(name,c.flag);
   cullSetLabel(name,c.label);
   cullSetTags(name,c.tags);
   cullSetCaption(name,c.caption);
   n++;
  }
 });
 return n;
}
