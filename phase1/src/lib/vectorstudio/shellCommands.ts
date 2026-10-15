import {requestVectorExport} from './exportSetup';
import type {CommandSpec} from '../commandSpec';
import * as S from './session';
import {rotateSelection,scaleSelection,selectionBounds,alignSelection,distributeSelection,ALIGN_MODES,ALIGN_TARGETS} from './transforms';
import {applyGradient,GRADIENT_KINDS,type GradientPatch} from './gradients';
import {groupSelection,ungroupSelection} from './groups';
import {applyBoolean,BOOL_OPS} from './booleanOps';
import {downloadSvg,downloadPng} from './exportFiles';
const empty={type:'object',properties:{},additionalProperties:false};
export function vectorShellCommandSpecs(active:()=>boolean):CommandSpec<any,unknown>[] {
 const ready=()=>active()&&S.getVectorSession().open;
 const selected=()=>ready()&&S.getVectorSession().selection.length>0;
 return [
  {id:'vector.export.open',title:'Vector: Export...',category:'Project',level:'ui',enabled:ready,params:empty,run:requestVectorExport},
  ...(['select','node','pen','rect','ellipse','line','polygon','star'] as const).map(tool=>({id:'vector.tool.'+tool,title:'Use vector '+tool+' tool',category:'View' as const,level:'ui' as const,params:empty,enabled:ready,run:()=>S.setTool(tool)})),
  {id:'vector.rotateSelection',title:'Rotate vector selection',category:'Edit',level:'ui',enabled:selected,params:{...empty,properties:{degrees:{type:'number'}},required:['degrees']},
   run:(p:{degrees:number})=>{const s=S.getVectorSession();if(p.degrees)S.commit(rotateSelection(s.doc,s.selection,p.degrees));}},
  {id:'vector.flipSelection',title:'Flip vector selection',category:'Edit',level:'ui',enabled:selected,params:{...empty,properties:{axis:{type:'string',enum:['horizontal','vertical']}},required:['axis']},
   run:(p:{axis:'horizontal'|'vertical'})=>{const s=S.getVectorSession(),b=selectionBounds(s.doc,s.selection);if(b)S.commit(scaleSelection(s.doc,s.selection,p.axis==='horizontal'?-1:1,p.axis==='vertical'?-1:1,{x:b.x+b.width/2,y:b.y+b.height/2}));}},
  {id:'vector.alignSelection',title:'Align vector selection',category:'Edit',level:'ui',enabled:selected,params:{...empty,properties:{mode:{type:'string',enum:[...ALIGN_MODES]},to:{type:'string',enum:[...ALIGN_TARGETS]}},required:['mode','to']},
   run:(p:{mode:typeof ALIGN_MODES[number];to:typeof ALIGN_TARGETS[number]})=>{const s=S.getVectorSession(),next=alignSelection(s.doc,s.selection,p.mode,p.to);if(next!==s.doc)S.commit(next);}},
  {id:'vector.distributeSelection',title:'Distribute vector selection',category:'Edit',level:'ui',enabled:selected,params:{...empty,properties:{axis:{type:'string',enum:['horizontal','vertical']}},required:['axis']},
   run:(p:{axis:'horizontal'|'vertical'})=>{const s=S.getVectorSession();S.commit(distributeSelection(s.doc,s.selection,p.axis));}},
  {id:'vector.booleanOp',title:'Combine vector shapes',category:'Edit',level:'ui',enabled:selected,params:{...empty,properties:{op:{type:'string',enum:[...BOOL_OPS]}},required:['op']},
   run:(p:{op:typeof BOOL_OPS[number]})=>{const s=S.getVectorSession(),r=applyBoolean(s.doc,s.selection,p.op);S.commit(r.doc);S.select(r.ids);}},
  {id:'vector.setGradient',title:'Set vector gradient fill',category:'Edit',level:'ui',enabled:selected,params:{...empty,properties:{kind:{type:'string',enum:[...GRADIENT_KINDS]},angle:{type:'number',minimum:0,maximum:360},startColor:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},endColor:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},stops:{type:'array',minItems:2,maxItems:16,items:{type:'object',properties:{offset:{type:'number',minimum:0,maximum:1},color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},opacity:{type:'number',minimum:0,maximum:1}},required:['offset','color','opacity'],additionalProperties:false}}}},
   run:(p:GradientPatch)=>{const s=S.getVectorSession(),next=applyGradient(s.doc,s.selection,p);if(next!==s.doc)S.commit(next);}},
  {id:'vector.group',title:'Group vector selection',category:'Edit',level:'ui',enabled:selected,params:empty,run:()=>{const s=S.getVectorSession(),next=groupSelection(s.doc,s.selection);if(next!==s.doc)S.commit(next);}},
  {id:'vector.ungroup',title:'Ungroup vector selection',category:'Edit',level:'ui',enabled:ready,params:{...empty,properties:{ids:{type:'array',items:{type:'string',minLength:1},uniqueItems:true,maxItems:200}}},run:(p:{ids?:string[]}={})=>{const s=S.getVectorSession(),next=ungroupSelection(s.doc,p.ids??s.selection);if(next!==s.doc)S.commit(next);}},
  {id:'vector.exportSvg',title:'Export vector SVG',category:'Project',level:'ui',enabled:ready,params:empty,run:()=>downloadSvg(S.getVectorSession().name)},
  {id:'vector.exportPng',title:'Export vector PNG',category:'Project',level:'ui',enabled:ready,params:{...empty,properties:{scale:{type:'number',minimum:0.1,maximum:8}}},run:(p:{scale?:number}={})=>{const s=S.getVectorSession();return downloadPng(s.name,s.doc.width,s.doc.height,p.scale??1);}},
 ];
}
