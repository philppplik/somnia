import type {CommandSpec} from '../commandSpec';
import * as S from './session';
import {rotateSelection,scaleSelection,selectionBounds} from './transforms';
import {downloadSvg,downloadPng} from './exportFiles';
const empty={type:'object',properties:{},additionalProperties:false};
export function vectorShellCommandSpecs(active:()=>boolean):CommandSpec<any,unknown>[] {
 const ready=()=>active()&&S.getVectorSession().open;
 const selected=()=>ready()&&S.getVectorSession().selection.length>0;
 return [
  ...(['select','node','pen','rect','ellipse','line','polygon','star'] as const).map(tool=>({id:'vector.tool.'+tool,title:'Use vector '+tool+' tool',category:'View' as const,level:'ui' as const,params:empty,enabled:ready,run:()=>S.setTool(tool)})),
  {id:'vector.rotateSelection',title:'Rotate vector selection',category:'Edit',level:'ui',enabled:selected,params:{...empty,properties:{degrees:{type:'number'}},required:['degrees']},
   run:(p:{degrees:number})=>{const s=S.getVectorSession();if(p.degrees)S.commit(rotateSelection(s.doc,s.selection,p.degrees));}},
  {id:'vector.flipSelection',title:'Flip vector selection',category:'Edit',level:'ui',enabled:selected,params:{...empty,properties:{axis:{type:'string',enum:['horizontal','vertical']}},required:['axis']},
   run:(p:{axis:'horizontal'|'vertical'})=>{const s=S.getVectorSession(),b=selectionBounds(s.doc,s.selection);if(b)S.commit(scaleSelection(s.doc,s.selection,p.axis==='horizontal'?-1:1,p.axis==='vertical'?-1:1,{x:b.x+b.width/2,y:b.y+b.height/2}));}},
  {id:'vector.exportSvg',title:'Export vector SVG',category:'Project',level:'ui',enabled:ready,params:empty,run:()=>downloadSvg(S.getVectorSession().name)},
  {id:'vector.exportPng',title:'Export vector PNG',category:'Project',level:'ui',enabled:ready,params:{...empty,properties:{scale:{type:'number',minimum:0.1,maximum:8}}},run:(p:{scale?:number}={})=>{const s=S.getVectorSession();return downloadPng(s.name,s.doc.width,s.doc.height,p.scale??1);}},
 ];
}
