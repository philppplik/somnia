import type {Composition} from './model';
import type {Edit} from './edit';
/**
 * Plan a split of layers at one time. A layer is split when the time lies strictly inside its in/out range. The copy
 * (placed above) becomes the later part. Audio layers are skipped (they trim through audio params). Pure.
 */
export interface SplitPlan{edits:Edit[];made:Record<string,string>;skipped:number}
export function splitPlan(c:Composition,ids:readonly string[],at:number,newIds:(n:number)=>string[]):SplitPlan{
 const picked=c.layers.filter(l=>ids.includes(l.id));
 const ok=picked.filter(l=>l.kind!=='audio'&&l.inT<at&&at<l.outT);
 const fresh=newIds(ok.length),made:Record<string,string>={},edits:Edit[]=[];
 ok.forEach((l,i)=>{
  made[l.id]=fresh[i];
  edits.push({type:'layers.duplicate',layers:[l.id],ids:[fresh[i]]},{type:'layer.timing',layer:l.id,inT:l.inT,outT:at},{type:'layer.timing',layer:fresh[i],inT:at,outT:l.outT},{type:'layer.update',layer:fresh[i],name:`${l.name} 2`.slice(0,200)});
 });
 return {edits,made,skipped:picked.length-ok.length};
}
