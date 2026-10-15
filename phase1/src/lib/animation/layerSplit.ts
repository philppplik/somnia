import type {Composition} from './model';
import type {Edit} from './edit';
/**
 * Plan a split of layers at one time. A layer is split when the time lies strictly inside its in/out range. The copy
 * (placed above) becomes the later part. Audio layers are skipped (they trim through audio params). Pure.
 */
export interface SplitPlan{edits:Edit[];made:Record<string,string>;skipped:number}
export function splitPlan(c:Composition,ids:readonly string[],at:number,newIds:(n:number)=>string[]):SplitPlan{
 const picked=c.layers.filter(l=>ids.includes(l.id));
 const ok=picked.filter(l=>l.kind==='audio'?!!l.audio&&l.offset<at&&at<l.offset+l.outT:l.inT<at&&at<l.outT);
 const fresh=newIds(ok.length),made:Record<string,string>={},edits:Edit[]=[];
 ok.forEach((l,i)=>{
  made[l.id]=fresh[i];
  if(l.kind==='audio'){
   // An audio clip is placed by `offset` (inT stays 0): the first part is cut short, the second starts at the playhead further into the same file, so the sound stays in sync.
   const cut=at-l.offset;
   edits.push({type:'layers.duplicate',layers:[l.id],ids:[fresh[i]]},{type:'audio.update',layer:l.id,length:cut},{type:'audio.update',layer:fresh[i],trimIn:l.audio!.trimIn+cut,length:l.outT-cut,offset:at},{type:'layer.update',layer:fresh[i],name:`${l.name} 2`.slice(0,200)});
   return;
  }
  edits.push({type:'layers.duplicate',layers:[l.id],ids:[fresh[i]]},{type:'layer.timing',layer:l.id,inT:l.inT,outT:at},{type:'layer.timing',layer:fresh[i],inT:at,outT:l.outT},{type:'layer.update',layer:fresh[i],name:`${l.name} 2`.slice(0,200)});
 });
 return {edits,made,skipped:picked.length-ok.length};
}
