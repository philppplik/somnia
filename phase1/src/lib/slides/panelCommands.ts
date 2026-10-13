import type {CommandSpec} from '../commandSpec';
import {registerCommandSpec} from '../commandBridge';
import {selectSlideText} from './panelSelection';
import {getSlidesSessionState,loadThumbnails,editSlideText,showSlide} from './session';
import {textIssue} from './panelModel';
import type {TextRun} from './editCopy';
import './panelI18n';
export interface PanelCommandDeps {
 state():{source:string;index:number;busy:boolean;working:Uint8Array|null;runs:TextRun[];summary:{slides:number}|null};
 thumbnails():Promise<void>;edit(run:TextRun,text:string):Promise<void>;show(index:number):Promise<void>;
 select(value:{source:string;slide:number;run:number}):void;
}
const identity={source:{type:'string',minLength:1},slide:{type:'integer',minimum:0},run:{type:'integer',minimum:0},old:{type:'string'}};
export function slidesPanelCommandSpecs(d:PanelCommandDeps):CommandSpec[]{
 const available=()=>{const s=d.state();return !!s.working&&!!s.summary&&!s.busy;};
 return [
  {id:'slides.loadThumbnails',title:'Load slide thumbnails',category:'View',level:'ui',enabled:available,run:()=>d.thumbnails()},
  {id:'slides.selectText',title:'Select slide text',category:'View',level:'ui',enabled:available,params:{type:'object',properties:identity,required:['source','slide','run','old'],additionalProperties:false},run:async p=>{
   const v=p as {source:string;slide:number;run:number;old:string};let s=d.state();const r=s.runs.find(r=>r.slide===v.slide&&r.run===v.run);
   if(s.source!==v.source||!r||r.text!==v.old)throw Error('Text selection is stale.');
   if(s.index!==v.slide)await d.show(v.slide);s=d.state();if(s.source!==v.source||s.index!==v.slide||s.busy||s.runs.find(r=>r.slide===v.slide&&r.run===v.run)?.text!==v.old)throw Error('Slide navigation did not complete.');
   d.select({source:v.source,slide:v.slide,run:v.run});
  }},
  {id:'slides.editText',title:'Apply slide text',category:'Edit',level:'ui',enabled:available,allowInInput:true,params:{type:'object',properties:{...identity,text:{type:'string',maxLength:16384}},required:['source','slide','run','old','text'],additionalProperties:false},run:async p=>{
   const v=p as {source:string;slide:number;run:number;old:string;text:string};const s=d.state();const r=s.runs.find(r=>r.slide===v.slide&&r.run===v.run);
   if(s.source!==v.source||s.index!==v.slide||!r||r.text!==v.old)throw Error('Text changed since selection.');
   if(textIssue(v.text))throw Error('Text contains unsupported characters or exceeds 16 KiB.');
   await d.edit(r,v.text);const after=d.state();if(after.source!==v.source||after.runs.find(x=>x.slide===v.slide&&x.run===v.run)?.text!==v.text)throw Error('Text edit did not complete.');
  }},
 ];
}
const deps:PanelCommandDeps={state:getSlidesSessionState,thumbnails:loadThumbnails,edit:editSlideText,show:showSlide,select:selectSlideText};
export function registerSlidesPanelCommands(){const offs=slidesPanelCommandSpecs(deps).map(s=>registerCommandSpec(s));return()=>offs.forEach(off=>off());}
