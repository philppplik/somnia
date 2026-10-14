import type {CommandSpec} from '../commandSpec';
import {registerCommandSpec} from '../commandBridge';
import {selectSlideText} from './panelSelection';
import {getSlidesSessionState,loadThumbnails,editSlideText,showSlide,moveSlideTo,duplicateSlideAt,deleteSlideAt,addSlideFromLayout} from './session';
import {textIssue} from './panelModel';
import type {TextRun} from './editCopy';
import './panelI18n';
export interface PanelCommandDeps {
 state():{source:string;index:number;busy:boolean;working:Uint8Array|null;runs:TextRun[];slideIds:number[];layouts:{part:string;supported:boolean}[];summary:{slides:number}|null};
 thumbnails():Promise<void>;edit(run:TextRun,text:string):Promise<void>;show(index:number):Promise<void>;
 select(value:{source:string;slide:number;run:number}):void;move(slideId:number,toIndex:number):Promise<void>;duplicate(slideId:number):Promise<void>;remove(slideId:number):Promise<void>;add(layoutPart:string,afterSlideId:number|null):Promise<void>;
}
const identity={source:{type:'string',minLength:1},slide:{type:'integer',minimum:0},run:{type:'integer',minimum:0},old:{type:'string'}};
export function slidesPanelCommandSpecs(d:PanelCommandDeps):CommandSpec[]{
 const available=()=>{const s=d.state();return !!s.working&&!!s.summary&&!s.busy;};
 const reorderable=()=>{const s=d.state();return available()&&s.slideIds.length>1&&s.slideIds.length===s.summary!.slides;};
 const slideId={type:'integer',minimum:256,maximum:2147483647} as const;
 const expected=(m:string)=>Object.assign(new Error(m),{expected:true});
 const step=async(delta:number)=>{const s=d.state(),to=s.index+delta;if(to<0||to>=s.slideIds.length)throw expected('The slide is already at the edge of the deck.');await d.move(s.slideIds[s.index],to);};
 return [
  {id:'slides.loadThumbnails',title:'Load slide thumbnails',category:'View',level:'ui',enabled:available,run:()=>d.thumbnails()},
  {id:'slides.selectText',title:'Select slide text',category:'View',level:'ui',enabled:available,params:{type:'object',properties:identity,required:['source','slide','run','old'],additionalProperties:false},run:async p=>{
   const v=p as {source:string;slide:number;run:number;old:string};let s=d.state();const r=s.runs.find(r=>r.slide===v.slide&&r.run===v.run);
   if(s.source!==v.source||!r||r.text!==v.old)throw Error('Text selection is stale.');
   if(s.index!==v.slide)await d.show(v.slide);s=d.state();if(s.source!==v.source||s.index!==v.slide||s.busy||s.runs.find(r=>r.slide===v.slide&&r.run===v.run)?.text!==v.old)throw Error('Slide navigation did not complete.');
   d.select({source:v.source,slide:v.slide,run:v.run});
  }},
  {id:'slides.moveSlide',title:'Move slide',category:'Edit',level:'ui',keywords:['reorder','slide','drag','position'],enabled:reorderable,params:{type:'object',properties:{source:identity.source,slideId:{type:'integer',minimum:256,maximum:2147483647},toIndex:{type:'integer',minimum:0,maximum:199}},required:['source','slideId','toIndex'],additionalProperties:false},run:async p=>{
   const v=p as {source:string;slideId:number;toIndex:number};const s=d.state();
   if(s.source!==v.source)throw expected('Deck changed since selection.');
   if(!s.slideIds.includes(v.slideId))throw expected('Slide no longer exists. Reselect the slide.');
   if(v.toIndex>=s.slideIds.length)throw expected(`Target position ${v.toIndex+1} is outside this ${s.slideIds.length}-slide deck.`);
   await d.move(v.slideId,v.toIndex);
  }},
  {id:'slides.moveSlideEarlier',title:'Move slide earlier',category:'Edit',level:'ui',keywords:['reorder','up','before'],enabled:()=>reorderable()&&d.state().index>0,run:()=>step(-1)},
  {id:'slides.moveSlideLater',title:'Move slide later',category:'Edit',level:'ui',keywords:['reorder','down','after'],enabled:()=>reorderable()&&d.state().index<d.state().slideIds.length-1,run:()=>step(1)},
  {id:'slides.duplicateSlide',title:'Duplicate slide',category:'Edit',level:'ui',keywords:['copy','clone','slide'],enabled:()=>reorderable()||(available()&&d.state().slideIds.length===1),params:{type:'object',properties:{source:identity.source,slideId:slideId},required:['source','slideId'],additionalProperties:false},run:async p=>{const v=p as {source:string;slideId:number};const s=d.state();
   if(s.source!==v.source)throw expected('Deck changed since selection.');if(!s.slideIds.includes(v.slideId))throw expected('Slide no longer exists. Reselect the slide.');if(s.slideIds.length>=200)throw expected('A deck can hold at most 200 slides.');await d.duplicate(v.slideId);}},
  {id:'slides.deleteSlide',title:'Delete slide',category:'Edit',level:'ui',keywords:['remove','slide'],enabled:()=>available()&&d.state().slideIds.length>1,params:{type:'object',properties:{source:identity.source,slideId:slideId},required:['source','slideId'],additionalProperties:false},run:async p=>{const v=p as {source:string;slideId:number};const s=d.state();
   if(s.source!==v.source)throw expected('Deck changed since selection.');if(!s.slideIds.includes(v.slideId))throw expected('Slide no longer exists. Reselect the slide.');if(s.slideIds.length<=1)throw expected('A presentation needs at least one slide.');await d.remove(v.slideId);}},
  {id:'slides.newSlide',title:'New slide from layout',category:'Edit',level:'ui',keywords:['add','insert','layout','slide'],enabled:()=>available()&&d.state().slideIds.length>0&&d.state().layouts.some(l=>l.supported),params:{type:'object',properties:{source:identity.source,layoutPart:{type:'string',pattern:'^ppt/slideLayouts/slideLayout[0-9]+\\.xml$'},afterSlideId:{type:['integer','null'],minimum:256,maximum:2147483647}},required:['source','layoutPart'],additionalProperties:false},run:async p=>{
   const v=p as {source:string;layoutPart:string;afterSlideId?:number|null};const s=d.state();
   if(s.source!==v.source)throw expected('Deck changed since selection.');const layout=s.layouts.find(l=>l.part===v.layoutPart);
   if(!layout)throw expected('Layout no longer exists.');if(!layout.supported)throw expected('This layout has placeholders new slides cannot create yet.');
   if(v.afterSlideId!=null&&!s.slideIds.includes(v.afterSlideId))throw expected('Slide no longer exists. Reselect the slide.');if(s.slideIds.length>=200)throw expected('A deck can hold at most 200 slides.');
   await d.add(v.layoutPart,v.afterSlideId??null);}},
  {id:'slides.editText',title:'Apply slide text',category:'Edit',level:'ui',enabled:available,allowInInput:true,params:{type:'object',properties:{...identity,text:{type:'string',maxLength:16384}},required:['source','slide','run','old','text'],additionalProperties:false},run:async p=>{
   const v=p as {source:string;slide:number;run:number;old:string;text:string};const s=d.state();const r=s.runs.find(r=>r.slide===v.slide&&r.run===v.run);
   if(s.source!==v.source||s.index!==v.slide||!r||r.text!==v.old)throw Error('Text changed since selection.');
   if(textIssue(v.text))throw Error('Text contains unsupported characters or exceeds 16 KiB.');
   await d.edit(r,v.text);const after=d.state();if(after.source!==v.source||after.runs.find(x=>x.slide===v.slide&&x.run===v.run)?.text!==v.text)throw Error('Text edit did not complete.');
  }},
 ];
}
const deps:PanelCommandDeps={state:getSlidesSessionState,thumbnails:loadThumbnails,edit:editSlideText,show:showSlide,select:selectSlideText,move:moveSlideTo,duplicate:duplicateSlideAt,remove:deleteSlideAt,add:addSlideFromLayout};
export function registerSlidesPanelCommands(){const offs=slidesPanelCommandSpecs(deps).map(s=>registerCommandSpec(s));return()=>offs.forEach(off=>off());}
