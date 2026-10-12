/**
 * Design Studio command specs (engine-hardening plan, step 1.5 / wave B).
 *
 * The studio's operations are exposed as typed command specs registered through
 * registerCommandSpec: palette, shortcuts, menus and the shared dispatcher all read the
 * same entries. The Design Studio keeps its own undo history (the past/future stacks in
 * session.ts); each spec below notes in its `history` comment what its run writes there.
 * No global undo stack is touched.
 *
 * Registration is scoped to the Design canvas mount (components/design/DesignCanvas.tsx),
 * so the commands exist only while the studio is on screen, matching the pdfedit and
 * slides studios. Studio-owned titles live in src/locales/design/ (cmd.design.* keys).
 */
import {registerCommandSpec} from '../commandBridge';
import type {CommandSpec} from '../commandSpec';
import {exportArtboardSVG,serializeDesignDocument} from './model';
import {alignPatches,distributePatches} from './inspectorModel';
import {downloadDesign,getDesignState,redoDesign,startDesign,undoDesign} from './session';
import {addDesignNode,chooseDesignTool,deleteDesignNodes,designRows,duplicateDesignNodes,patchDesignNodes} from './panelAdapter';
import type {AlignKind,DesignToolId,DistributeAxis} from './panelContract';

/** Same wording the canvas uses before discarding an unsaved design. */
export const DESIGN_REPLACE_CONFIRM='Replace this design? Export the project first to keep your changes.';
/** True when no design is dirty, or the user confirmed discarding it. */
export function confirmReplaceDesign():boolean{
 if(!getDesignState().dirty)return true;
 if(typeof window==='undefined'||typeof window.confirm!=='function')return true;
 return window.confirm(DESIGN_REPLACE_CONFIRM);
}

const open=()=>getDesignState().document!==null;
const board=()=>{const s=getDesignState();return s.document?.artboards.find(a=>a.id===s.artboardId)??null;};
const selection=()=>getDesignState().selectedIds;
const selectedRows=()=>{const ids=selection();return designRows().filter(row=>ids.includes(row.id));};

const positionParams={type:'object',properties:{x:{type:'number',minimum:-32768,maximum:32768},y:{type:'number',minimum:-32768,maximum:32768}},additionalProperties:false} as const;
type PositionParams={x?:number;y?:number};

interface DesignStateSummary{open:boolean;dirty:boolean;name:string;artboards:number;layers:number;selected:number;tool:string;canUndo:boolean;canRedo:boolean}
const stateSummary=():DesignStateSummary=>{const s=getDesignState();const b=s.document?.artboards.find(a=>a.id===s.artboardId);return {open:s.document!==null,dirty:s.dirty,name:s.document?.name??'',artboards:s.document?.artboards.length??0,layers:b?.nodes.length??0,selected:s.selectedIds.length,tool:s.tool,canUndo:s.past.length>0,canRedo:s.future.length>0};};

/** Registers every Design Studio spec. Returns one disposer that removes all of them. */
export function registerDesignCommands():()=>void{
 const offs:Array<()=>void>=[];
 const add=<P,R>(spec:CommandSpec<P,R>)=>{offs.push(registerCommandSpec(spec));};

 // history: none (read-only).
 add<never,DesignStateSummary>({
  id:'design.getState',title:'Design: Read session state',category:'Tools',level:'read',keywords:['design','state'],
  result:{type:'object',properties:{open:{type:'boolean'},dirty:{type:'boolean'},name:{type:'string'},artboards:{type:'integer'},layers:{type:'integer'},selected:{type:'integer'},tool:{type:'string'},canUndo:{type:'boolean'},canRedo:{type:'boolean'}},required:['open','dirty','name','artboards','layers','selected','tool','canUndo','canRedo']},
  run:()=>stateSummary(),
 });

 // history: resets the design session (fresh document, empty stacks).
 add<never,void>({
  id:'design.new',title:'Design: New design',category:'Project',level:'ui',keywords:['design','new','blank'],
  run:()=>{if(confirmReplaceDesign())startDesign();},
 });

 // history: pops one design-session transaction (past -> future).
 add<never,void>({
  id:'design.undo',title:'Design: Undo',category:'Edit',level:'ui',keywords:['design','undo'],
  enabled:()=>getDesignState().past.length>0,
  run:()=>undoDesign(),
 });

 // history: replays one design-session transaction (future -> past).
 add<never,void>({
  id:'design.redo',title:'Design: Redo',category:'Edit',level:'ui',keywords:['design','redo'],
  enabled:()=>getDesignState().future.length>0,
  run:()=>redoDesign(),
 });

 // history: 'frame' writes one transaction (new artboard); the other tools only switch state.
 add<{tool:DesignToolId},void>({
  id:'design.setTool',title:'Design: Select tool',category:'Tools',level:'ui',keywords:['design','tool'],
  params:{type:'object',properties:{tool:{type:'string',enum:['select','hand','frame','rectangle','text']}},required:['tool'],additionalProperties:false},
  enabled:open,
  run:params=>chooseDesignTool(params.tool),
 });

 // history: one design-session transaction (new layer).
 add<PositionParams,void>({
  id:'design.addRectangle',title:'Design: Add rectangle',category:'Insert',level:'ui',keywords:['design','rectangle','shape'],
  params:positionParams,
  enabled:()=>board()!==null,
  run:params=>{addDesignNode('rectangle',params);},
 });

 // history: one design-session transaction (new layer).
 add<PositionParams,void>({
  id:'design.addText',title:'Design: Add text layer',category:'Insert',level:'ui',keywords:['design','text'],
  params:positionParams,
  enabled:()=>board()!==null,
  run:params=>{addDesignNode('text',params);},
 });

 // history: one design-session transaction (layers removed; locked layers survive).
 add<never,void>({
  id:'design.deleteSelection',title:'Design: Delete selected layers',category:'Edit',level:'ui',keywords:['design','delete','remove'],
  enabled:()=>selection().length>0,
  run:()=>deleteDesignNodes(selection()),
 });

 // history: one design-session transaction (copies appended; locked layers are skipped).
 add<never,void>({
  id:'design.duplicateSelection',title:'Design: Duplicate selected layers',category:'Edit',level:'ui',keywords:['design','duplicate','copy'],
  enabled:()=>selection().length>0,
  run:()=>duplicateDesignNodes(selection()),
 });

 // history: one design-session transaction for the whole batch.
 add<{kind:AlignKind},void>({
  id:'design.alignSelection',title:'Design: Align selected layers',category:'Edit',level:'ui',keywords:['design','align'],
  params:{type:'object',properties:{kind:{type:'string',enum:['left','centerH','right','top','centerV','bottom']}},required:['kind'],additionalProperties:false},
  enabled:()=>selection().length>=2,
  run:params=>{patchDesignNodes(alignPatches(selectedRows(),params.kind));},
 });

 // history: one design-session transaction for the whole batch.
 add<{axis:DistributeAxis},void>({
  id:'design.distributeSelection',title:'Design: Distribute selected layers',category:'Edit',level:'ui',keywords:['design','distribute'],
  params:{type:'object',properties:{axis:{type:'string',enum:['horizontal','vertical']}},required:['axis'],additionalProperties:false},
  enabled:()=>selection().length>=3,
  run:params=>{patchDesignNodes(distributePatches(selectedRows(),params.axis));},
 });

 // history: none (download of the current document; dirty stays honest).
 add<never,void>({
  id:'design.exportProject',title:'Design: Export project (.somdesign)',category:'Project',level:'ui',keywords:['design','export','download'],
  enabled:open,
  run:()=>{const doc=getDesignState().document;if(doc)downloadDesign(`${doc.name}.somdesign`,serializeDesignDocument(doc),'application/json');},
 });

 // history: none (download of the active artboard; dirty stays honest).
 add<never,void>({
  id:'design.exportSvg',title:'Design: Export artboard as SVG',category:'Project',level:'ui',keywords:['design','export','svg'],
  enabled:()=>board()!==null,
  run:()=>{const b=board();if(b)downloadDesign(`${b.name}.svg`,exportArtboardSVG(b),'image/svg+xml');},
 });

 return()=>{for(const off of offs)off();};
}
