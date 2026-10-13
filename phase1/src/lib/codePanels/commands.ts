import {registerCommandSpec} from '../commandBridge';
import type {CommandSpec} from '../commandSpec';
/** UI adapters are supplied by the canvas. This module never imports store or components. */
export interface CodePanelActions {ready:()=>boolean;reveal:(id:string)=>void;attribute:(id:string,name:string,value:string|null)=>void;width:(width:number)=>void}
export function codePanelSpecs(actions:CodePanelActions):readonly CommandSpec<any,void>[]{return [
 {id:'code.outline.reveal',title:'Reveal element in source',category:'View',level:'ui',params:{type:'object',properties:{id:{type:'string',minLength:1}},required:['id'],additionalProperties:false},enabled:actions.ready,run:({id}:{id:string})=>actions.reveal(id)},
 {id:'code.attribute.set',title:'Set element attribute',category:'Edit',level:'ui',params:{type:'object',properties:{id:{type:'string',minLength:1},name:{type:'string',minLength:1},value:{type:['string','null']}},required:['id','name','value'],additionalProperties:false},enabled:actions.ready,run:({id,name,value}:{id:string;name:string;value:string|null})=>actions.attribute(id,name,value)},
 {id:'code.preview.width',title:'Set preview width',category:'View',level:'ui',params:{type:'object',properties:{width:{type:'integer',minimum:200,maximum:3840}},required:['width'],additionalProperties:false},enabled:actions.ready,run:({width}:{width:number})=>actions.width(width)},
 ];}
export function registerCodePanelCommands(actions:CodePanelActions){const offs=codePanelSpecs(actions).map(s=>registerCommandSpec(s));return()=>offs.reverse().forEach(off=>off());}
