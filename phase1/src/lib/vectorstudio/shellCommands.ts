import {requestVectorExport} from './exportSetup';
import type {CommandSpec} from '../commandSpec';
import * as S from './session';
import {rotateSelection,scaleSelection,selectionBounds,alignSelection,distributeSelection,ALIGN_MODES,ALIGN_TARGETS} from './transforms';
import {applyGradient,GRADIENT_KINDS,type GradientPatch} from './gradients';
import {roundCorners,RADIUS_LIMITS} from './roundCorners';
import {simplifySelection,SIMPLIFY_LIMITS} from './simplify';
import {offsetSelection,outlineStroke,OFFSET_LIMITS} from './offsetOps';
import {splitPath,joinPaths,reverseSelection} from './pathOps';
import {toggleLock} from './lock';
import {makeClip,releaseClip} from './clip';
import {copyStyle,bufferedStyle,hasStyleBuffer} from './styleClip';
import {moveGuide,clearGuides} from './guideOps';
import {FONT_WEIGHTS,FONT_STYLES,TEXT_ANCHORS,TEXT_LIMITS} from '../vectorio';
import {addSwatch,removeSwatch,swatchToApply} from './swatchOps';
import {groupSelection,ungroupSelection} from './groups';
import {applyBoolean,BOOL_OPS} from './booleanOps';
import {downloadSvg,downloadPng} from './exportFiles';
import {EXPORT_AREAS,PADDING_LIMITS} from './exportArea';
const areaProps={area:{type:'string',enum:[...EXPORT_AREAS]},padding:{type:'number',minimum:PADDING_LIMITS.min,maximum:PADDING_LIMITS.max}};
const empty={type:'object',properties:{},additionalProperties:false};
export function vectorShellCommandSpecs(active:()=>boolean):CommandSpec<any,unknown>[] {
 const ready=()=>active()&&S.getVectorSession().open;
 const selected=()=>ready()&&S.getVectorSession().selection.length>0;
 return [
  {id:'vector.export.open',title:'Vector: Export...',category:'Project',level:'ui',enabled:ready,params:empty,run:requestVectorExport},
  ...(['select','node','pen','rect','ellipse','line','polygon','star','text'] as const).map(tool=>({id:'vector.tool.'+tool,title:'Use vector '+tool+' tool',category:'View' as const,level:'ui' as const,params:empty,enabled:ready,run:()=>S.setTool(tool)})),
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
  {id:'vector.splitPath',title:'Split vector path at node',category:'Edit',level:'ui',enabled:ready,params:{...empty,properties:{pathId:{type:'string',minLength:1},nodeId:{type:'string',minLength:1}},required:['pathId','nodeId']},
   run:(p:{pathId:string;nodeId:string})=>{const s=S.getVectorSession(),r=splitPath(s.doc,p.pathId,p.nodeId);S.commit(r.doc,{selection:r.ids,nodePath:null,selectedNode:null});}},
  {id:'vector.joinPaths',title:'Join vector paths',category:'Edit',level:'ui',enabled:selected,params:empty,
   run:()=>{const s=S.getVectorSession(),r=joinPaths(s.doc,s.selection);S.commit(r.doc,{selection:[r.id],nodePath:null,selectedNode:null});}},
  {id:'vector.reversePath',title:'Reverse vector path direction',category:'Edit',level:'ui',enabled:selected,params:empty,
   run:()=>{const s=S.getVectorSession(),next=reverseSelection(s.doc,s.selection);if(next!==s.doc)S.commit(next);}},
  {id:'vector.offsetPath',title:'Offset vector path',category:'Edit',level:'ui',enabled:selected,params:{...empty,properties:{distance:{type:'number',minimum:-OFFSET_LIMITS.max,maximum:OFFSET_LIMITS.max}},required:['distance']},
   run:(p:{distance:number})=>{const s=S.getVectorSession(),r=offsetSelection(s.doc,s.selection,p.distance);S.commit(r.doc,{selection:r.ids,nodePath:null,selectedNode:null});}},
  {id:'vector.outlineStroke',title:'Outline vector stroke',category:'Edit',level:'ui',enabled:selected,params:empty,
   run:()=>{const s=S.getVectorSession(),r=outlineStroke(s.doc,s.selection);S.commit(r.doc,{selection:r.ids,nodePath:null,selectedNode:null});}},
  {id:'vector.simplifyPath',title:'Simplify vector path',category:'Edit',level:'ui',enabled:selected,params:{...empty,properties:{tolerance:{type:'number',minimum:SIMPLIFY_LIMITS.min,maximum:SIMPLIFY_LIMITS.max}},required:['tolerance']},
   run:(p:{tolerance:number})=>{const s=S.getVectorSession();S.commit(simplifySelection(s.doc,s.selection,p.tolerance),{nodePath:null,selectedNode:null});}},
  {id:'vector.roundCorners',title:'Round vector corners',category:'Edit',level:'ui',enabled:selected,params:{...empty,properties:{radius:{type:'number',minimum:RADIUS_LIMITS.min,maximum:RADIUS_LIMITS.max},nodeIds:{type:'array',items:{type:'string',minLength:1},uniqueItems:true,maxItems:200}},required:['radius']},
   run:(p:{radius:number;nodeIds?:string[]})=>{const s=S.getVectorSession(),next=roundCorners(s.doc,s.selection,p.radius,p.nodeIds);S.commit(next,{nodePath:null,selectedNode:null});}},
  {id:'vector.toggleLocked',title:'Lock or unlock vector object',category:'Edit',level:'ui',enabled:ready,params:{...empty,properties:{id:{type:'string',minLength:1,maxLength:80}},required:['id']},run:(p:{id:string})=>{const s=S.getVectorSession();S.commit(toggleLock(s.doc,p.id));}},
  {id:'vector.moveGuide',title:'Add, move or remove a ruler guide',category:'Edit',level:'ui',enabled:ready,params:{...empty,properties:{axis:{type:'string',enum:['x','y']},from:{type:'number',minimum:-1e6,maximum:1e6},to:{type:'number',minimum:-1e6,maximum:1e6}},required:['axis']},
   run:(p:{axis:'x'|'y';from?:number;to?:number})=>{const s=S.getVectorSession();S.commit(moveGuide(s.doc,p.axis,p.from,p.to));}},
  {id:'vector.addSwatch',title:'Add a colour swatch',category:'Edit',level:'ui',enabled:ready,params:{...empty,properties:{color:{type:'string',pattern:'^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$'}},required:['color']},run:(p:{color:string})=>{const s=S.getVectorSession();S.commit(addSwatch(s.doc,p.color));}},
  {id:'vector.removeSwatch',title:'Remove a colour swatch',category:'Edit',level:'ui',enabled:ready,params:{...empty,properties:{color:{type:'string',pattern:'^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$'}},required:['color']},run:(p:{color:string})=>{const s=S.getVectorSession();S.commit(removeSwatch(s.doc,p.color));}},
  {id:'vector.applySwatch',title:'Apply a colour swatch',category:'Edit',level:'ui',enabled:selected,params:{...empty,properties:{color:{type:'string',pattern:'^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$'},target:{type:'string',enum:['fill','stroke']}},required:['color','target']},run:(p:{color:string;target:'fill'|'stroke'})=>{if(p.target!=='fill'&&p.target!=='stroke')throw new RangeError('target must be fill or stroke');const s=S.getVectorSession();S.setStyle({[p.target]:swatchToApply(s.doc,p.color)});}},
  {id:'vector.addText',title:'Add a text object',category:'Edit',level:'ui',enabled:ready,params:{...empty,properties:{x:{type:'number',minimum:-1e6,maximum:1e6},y:{type:'number',minimum:-1e6,maximum:1e6},...{text:{type:'string',maxLength:TEXT_LIMITS.maxChars},fontFamily:{type:'string',maxLength:TEXT_LIMITS.maxFamily},fontSize:{type:'number',minimum:TEXT_LIMITS.minSize,maximum:TEXT_LIMITS.maxSize},fontWeight:{type:'string',enum:[...FONT_WEIGHTS]},fontStyle:{type:'string',enum:[...FONT_STYLES]},anchor:{type:'string',enum:[...TEXT_ANCHORS]},fill:{type:'string',pattern:'^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$'}}},required:['x','y']},run:(p:Parameters<typeof S.addText>[0])=>{S.addText(p);}},
  {id:'vector.setText',title:'Edit a text object',category:'Edit',level:'ui',enabled:ready,params:{...empty,properties:{id:{type:'string',minLength:1,maxLength:80},patch:{...empty,properties:{x:{type:'number',minimum:-1e6,maximum:1e6},y:{type:'number',minimum:-1e6,maximum:1e6},...{text:{type:'string',maxLength:TEXT_LIMITS.maxChars},fontFamily:{type:'string',maxLength:TEXT_LIMITS.maxFamily},fontSize:{type:'number',minimum:TEXT_LIMITS.minSize,maximum:TEXT_LIMITS.maxSize},fontWeight:{type:'string',enum:[...FONT_WEIGHTS]},fontStyle:{type:'string',enum:[...FONT_STYLES]},anchor:{type:'string',enum:[...TEXT_ANCHORS]},fill:{type:'string',pattern:'^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$'}}}}},required:['id','patch']},run:(p:{id:string;patch:Parameters<typeof S.updateText>[1]})=>{S.updateText(p.id,p.patch);}},
  {id:'vector.deleteText',title:'Delete a text object',category:'Edit',level:'ui',enabled:()=>ready()&&!!S.getVectorSession().textSel,params:{...empty,properties:{id:{type:'string',minLength:1,maxLength:80}},required:['id']},run:(p:{id:string})=>{S.deleteText(p.id);}},
  {id:'vector.clearGuides',title:'Clear all ruler guides',category:'Edit',level:'ui',enabled:ready,params:empty,run:()=>{const s=S.getVectorSession();S.commit(clearGuides(s.doc));}},
  {id:'vector.makeClip',title:'Make clipping mask',category:'Edit',level:'ui',enabled:selected,params:empty,run:()=>{const s=S.getVectorSession();S.commit(makeClip(s.doc,s.selection));}},
  {id:'vector.copyStyle',title:'Copy vector style',category:'Edit',level:'ui',enabled:selected,params:empty,run:()=>{const s=S.getVectorSession();copyStyle(s.doc,s.selection);}},
  {id:'vector.pasteStyle',title:'Paste vector style',category:'Edit',level:'ui',enabled:()=>selected()&&hasStyleBuffer(),params:empty,run:()=>{const b=bufferedStyle();if(b)S.setStyle(b);}},
  {id:'vector.releaseClip',title:'Release clipping mask',category:'Edit',level:'ui',enabled:selected,params:empty,run:()=>{const s=S.getVectorSession();S.commit(releaseClip(s.doc,s.selection));}},
  {id:'vector.group',title:'Group vector selection',category:'Edit',level:'ui',enabled:selected,params:empty,run:()=>{const s=S.getVectorSession(),next=groupSelection(s.doc,s.selection);if(next!==s.doc)S.commit(next);}},
  {id:'vector.ungroup',title:'Ungroup vector selection',category:'Edit',level:'ui',enabled:ready,params:{...empty,properties:{ids:{type:'array',items:{type:'string',minLength:1},uniqueItems:true,maxItems:200}}},run:(p:{ids?:string[]}={})=>{const s=S.getVectorSession(),next=ungroupSelection(s.doc,p.ids??s.selection);if(next!==s.doc)S.commit(next);}},
  {id:'vector.exportSvg',title:'Export vector SVG',category:'Project',level:'ui',enabled:ready,params:{...empty,properties:areaProps},run:(p:{area?:'page'|'selection'|'content';padding?:number}={})=>downloadSvg(S.getVectorSession().name,p)},
  {id:'vector.exportPng',title:'Export vector PNG',category:'Project',level:'ui',enabled:ready,params:{...empty,properties:{...areaProps,scale:{type:'number',minimum:0.1,maximum:8},background:{type:'string',enum:['transparent','white']}}},run:(p:{scale?:number;area?:'page'|'selection'|'content';padding?:number;background?:'transparent'|'white'}={})=>{const s=S.getVectorSession();return downloadPng(s.name,s.doc.width,s.doc.height,p.scale??1,p);}},
 ];
}
