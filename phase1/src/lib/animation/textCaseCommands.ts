import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Layer} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
/** Text tools for many layers at once: change case, find and replace. Counter layers keep their `{n}` slot. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const TEXT_CASES=['upper','lower','title','sentence'] as const;
export type TextCase=typeof TEXT_CASES[number];
export const MAX_TEXT_LAYERS=200,MAX_TEXT_LEN=2000;
const keepSlot=(s:string,f:(x:string)=>string):string=>s.split('{n}').map(f).join('{n}');
export function changeCase(s:string,mode:TextCase):string{
 return keepSlot(s,x=>mode==='upper'?x.toLocaleUpperCase():mode==='lower'?x.toLocaleLowerCase()
  :mode==='title'?x.toLocaleLowerCase().replace(/(^|[\s\-/([“"'])(\p{L})/gu,(_m,a:string,b:string)=>a+b.toLocaleUpperCase())
  :x.toLocaleLowerCase().replace(/(^|[.!?]\s+|\n\s*)(\p{L})/gu,(_m,a:string,b:string)=>a+b.toLocaleUpperCase()));
}
export function replaceText(s:string,find:string,by:string,matchCase:boolean):string{
 if(matchCase)return s.split(find).join(by);
 const lo=s.toLocaleLowerCase(),f=find.toLocaleLowerCase();if(lo.length!==s.length)return s.split(find).join(by);
 let out='',i=0;for(;;){const j=lo.indexOf(f,i);if(j<0){out+=s.slice(i);break;}out+=s.slice(i,j)+by;i=j+f.length;}return out;
}
const textLayers=(c:NonNullable<ReturnType<typeof findComp>>,ids:string[]|undefined,fallbackAll:boolean):Layer[]=>{
 const picked=(ids??[]).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l&&l.kind==='text');
 const ls=picked.length||!fallbackAll?picked:c.layers.filter(l=>l.kind==='text');return ls.filter(l=>!l.locked).slice(0,MAX_TEXT_LAYERS);
};
const apply=(c:NonNullable<ReturnType<typeof findComp>>,ls:Layer[],f:(t:string)=>string)=>{
 const s=animationSession(),edits:Edit[]=[];
 for(const l of ls){const t=l.source.text??'',n=f(t);if(n!==t){if(!n.trim())return expected(`${l.name} would end up empty.`);if(n.length>MAX_TEXT_LEN)return expected(`${l.name} would be longer than ${MAX_TEXT_LEN} characters.`);edits.push({type:'layer.update',layer:l.id,source:{text:n}} as Edit);}}
 if(!edits.length)return expected('Nothing changes: the text already looks like that.');
 try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
 return {layers:edits.length};
};
export const textCaseSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.text.case',title:'Change the case of the ticked text layers',category:'Edit',level:'ui',keywords:['animation','text','case','uppercase','lowercase','title case','capitalize','sentence','caps'],
 params:{type:'object',properties:{mode:{type:'string',enum:[...TEXT_CASES]},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_TEXT_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.some(l=>l.kind==='text');},
 run:((p:{mode?:string;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const mode=(p.mode??'upper') as TextCase;if(!TEXT_CASES.includes(mode))return expected('Choose upper, lower, title or sentence case.');
  const ls=textLayers(c,p.layers??layerSetIds(s.getState().view.selectedLayer),false);if(!ls.length)return expected('Tick at least one unlocked text layer.');
  return apply(c,ls,t=>changeCase(t,mode));
 }) as (p:unknown)=>unknown},{
 id:'animation.text.replace',title:'Find and replace text in the ticked text layers (all text layers when none is ticked)',category:'Edit',level:'ui',keywords:['animation','text','find','replace','search','rename','translate','typo','localise','all'],
 params:{type:'object',properties:{find:{type:'string',minLength:1,maxLength:200},replace:{type:'string',maxLength:200},matchCase:{type:'boolean'},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_TEXT_LAYERS}},required:['find'],additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.some(l=>l.kind==='text');},
 run:((p:{find?:string;replace?:string;matchCase?:boolean;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const find=p.find??'';if(!find||find.length>200)return expected('Enter the text to find (up to 200 characters).');
  if(find.includes('{n}'))return expected('The counter slot {n} cannot be replaced here.');
  const by=p.replace??'';if(by.length>200)return expected('The replacement is at most 200 characters.');
  const ls=textLayers(c,p.layers??layerSetIds(s.getState().view.selectedLayer),true);if(!ls.length)return expected('There is no unlocked text layer.');
  return apply(c,ls,t=>replaceText(t,find,by,p.matchCase===true));
 }) as (p:unknown)=>unknown}];
