import type {CommandSpec} from '../commandSpec';
import {registerCommandSpec} from '../commandBridge';
import {selectSlideText} from './panelSelection';
import {getSlidesSessionState,loadThumbnails,editSlideText,showSlide,moveSlideTo,duplicateSlideAt,deleteSlideAt,addSlideFromLayout,setShapeBoundsAt} from './session';
import {textIssue} from './panelModel';
import type {TextRun} from './editCopy';
import './panelI18n';
import {selectShape,getShapeSelection,type ShapeSelection} from './shapeSelection';
import {stepShape,moveBox,resizeBox,boxOf} from './shapeGeometry';
import {boundsEditIssue,type ShapeRef,type BoundsBox} from './deckPackage';
export interface PanelCommandDeps {
 state():{source:string;index:number;busy:boolean;working:Uint8Array|null;runs:TextRun[];slideIds:number[];layouts:{part:string;supported:boolean}[];model:{slides:{id:number;shapes:ShapeRef[]}[];slideSize:{cx:number;cy:number}|null}|null;summary:{slides:number}|null};
 thumbnails():Promise<void>;edit(run:TextRun,text:string):Promise<void>;show(index:number):Promise<void>;
 select(value:{source:string;slide:number;run:number}):void;move(slideId:number,toIndex:number):Promise<void>;duplicate(slideId:number):Promise<void>;remove(slideId:number):Promise<void>;add(layoutPart:string,afterSlideId:number|null):Promise<void>;setBounds(slideId:number,shapeId:number,expected:BoundsBox,next:BoundsBox):Promise<void>;pick(value:ShapeSelection|null):void;picked():ShapeSelection|null;
}
const identity={source:{type:'string',minLength:1},slide:{type:'integer',minimum:0},run:{type:'integer',minimum:0},old:{type:'string'}};
export function slidesPanelCommandSpecs(d:PanelCommandDeps):CommandSpec[]{
 const available=()=>{const s=d.state();return !!s.working&&!!s.summary&&!s.busy;};
 const reorderable=()=>{const s=d.state();return available()&&s.slideIds.length>1&&s.slideIds.length===s.summary!.slides;};
 const slideId={type:'integer',minimum:256,maximum:2147483647} as const;
 const coord={type:'integer',minimum:-10000000000,maximum:10000000000} as const,box={type:'object',properties:{x:coord,y:coord,w:coord,h:coord},required:['x','y','w','h'],additionalProperties:false} as const;
 const shapesOf=()=>{const s=d.state(),id=s.slideIds[s.index];return s.model?.slides.find(x=>x.id===id)?.shapes??[];};
 const cycle=(delta:1|-1)=>{const s=d.state(),id=s.slideIds[s.index],cur=d.picked();const next=stepShape(shapesOf(),cur&&cur.source===s.source&&cur.slideId===id?cur.shapeId:null,delta);if(next)d.pick({source:s.source,slideId:id,shapeId:next.id});};
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
  {id:'slides.selectShape',title:'Select shape',category:'View',level:'ui',keywords:['shape','object','select'],enabled:()=>{const s=d.state();return available()&&!!s.model&&s.slideIds.length>0;},params:{type:'object',properties:{source:identity.source,slideId:slideId,shapeId:{type:['integer','null'],minimum:0,maximum:2147483647}},required:['source','slideId','shapeId'],additionalProperties:false},run:p=>{
   const v=p as {source:string;slideId:number;shapeId:number|null};const s=d.state();
   if(s.source!==v.source||s.slideIds[s.index]!==v.slideId)throw expected('Slide changed since selection.');
   if(v.shapeId===null){d.pick(null);return;}
   const shape=s.model?.slides.find(x=>x.id===v.slideId)?.shapes.find(x=>x.id===v.shapeId);
   if(!shape||shape.parentId!==null)throw expected('Shape no longer exists.');
   d.pick({source:v.source,slideId:v.slideId,shapeId:v.shapeId});}},
  {id:'slides.setShapeBounds',title:'Move or resize text box',category:'Edit',level:'ui',keywords:['shape','text box','move','resize','position','size'],enabled:available,params:{type:'object',properties:{source:identity.source,slideId:slideId,shapeId:{type:'integer',minimum:0,maximum:2147483647},expected:box,next:box},required:['source','slideId','shapeId','expected','next'],additionalProperties:false},run:async p=>{
   const v=p as {source:string;slideId:number;shapeId:number;expected:BoundsBox;next:BoundsBox};const s=d.state();
   if(s.source!==v.source||s.slideIds[s.index]!==v.slideId)throw expected('Slide changed since selection.');
   const shape=s.model?.slides.find(x=>x.id===v.slideId)?.shapes.find(x=>x.id===v.shapeId);
   if(!shape)throw expected('Shape no longer exists.');
   const issue=boundsEditIssue(shape);if(issue)throw expected(`This shape cannot be moved or resized (${issue}).`);
   await d.setBounds(v.slideId,v.shapeId,v.expected,v.next);}},
  {id:'slides.nudgeShape',title:'Nudge selected text box',category:'Edit',level:'ui',keywords:['shape','text box','nudge','move','resize','arrow'],enabled:available,params:{type:'object',properties:{mode:{enum:['move','resize']},dxPt:{type:'integer',minimum:-100,maximum:100},dyPt:{type:'integer',minimum:-100,maximum:100}},required:['mode','dxPt','dyPt'],additionalProperties:false},run:async p=>{
   const v=p as {mode:'move'|'resize';dxPt:number;dyPt:number};const s=d.state(),pick=d.picked();
   if(!pick||pick.source!==s.source||s.slideIds[s.index]!==pick.slideId)throw expected('Select a text box first.');
   const slide=s.model?.slides.find(x=>x.id===pick.slideId),shape=slide?.shapes.find(x=>x.id===pick.shapeId),size=s.model?.slideSize;
   if(!shape||!size)throw expected('Shape no longer exists.');
   const issue=boundsEditIssue(shape);if(issue)throw expected(`This shape cannot be moved or resized (${issue}).`);
   const from=boxOf(shape.bounds!),dx=v.dxPt*12700,dy=v.dyPt*12700;
   const next=v.mode==='move'?moveBox(from,dx,dy,size):resizeBox(from,'se',dx,dy,size);
   if(next.x===from.x&&next.y===from.y&&next.w===from.w&&next.h===from.h)return;
   await d.setBounds(pick.slideId,pick.shapeId,from,next);}},
  {id:'slides.selectNextShape',title:'Select next shape',category:'View',level:'ui',keywords:['shape','object','tab','next'],enabled:()=>available()&&shapesOf().length>0,run:()=>cycle(1)},
  {id:'slides.selectPreviousShape',title:'Select previous shape',category:'View',level:'ui',keywords:['shape','object','previous'],enabled:()=>available()&&shapesOf().length>0,run:()=>cycle(-1)},
  {id:'slides.editText',title:'Apply slide text',category:'Edit',level:'ui',enabled:available,allowInInput:true,params:{type:'object',properties:{...identity,text:{type:'string',maxLength:16384}},required:['source','slide','run','old','text'],additionalProperties:false},run:async p=>{
   const v=p as {source:string;slide:number;run:number;old:string;text:string};const s=d.state();const r=s.runs.find(r=>r.slide===v.slide&&r.run===v.run);
   if(s.source!==v.source||s.index!==v.slide||!r||r.text!==v.old)throw Error('Text changed since selection.');
   if(textIssue(v.text))throw Error('Text contains unsupported characters or exceeds 16 KiB.');
   await d.edit(r,v.text);const after=d.state();if(after.source!==v.source||after.runs.find(x=>x.slide===v.slide&&x.run===v.run)?.text!==v.text)throw Error('Text edit did not complete.');
  }},
 ];
}
const deps:PanelCommandDeps={state:getSlidesSessionState,thumbnails:loadThumbnails,edit:editSlideText,show:showSlide,select:selectSlideText,move:moveSlideTo,duplicate:duplicateSlideAt,remove:deleteSlideAt,add:addSlideFromLayout,setBounds:setShapeBoundsAt,pick:selectShape,picked:getShapeSelection};
export function registerSlidesPanelCommands(){const offs=slidesPanelCommandSpecs(deps).map(s=>registerCommandSpec(s));return()=>offs.forEach(off=>off());}
