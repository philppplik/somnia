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
import {addBoard,deleteBoard,duplicateBoard,moveBoard,nudgeSelection,renameBoard,resizeBoard,restackSelection,rotateBoard,selectAllLayers,setBoardBackground} from './artboardActions';
import {ARTBOARD_PRESETS,fitZoom,presetById,type StackMove} from './artboards';
import {editDesign,selectArtboard,selectDesignNode} from './session';
import {getDesignView,setDesignZoom,stepDesignZoom} from './view';

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

 // ---- Shell commands: rail tools, artboards, view, stacking, colour. Each writes at most one undo step. ----
 const hasDoc=open;
 const boardIndex=()=>{const s=getDesignState();return s.document?.artboards.findIndex(a=>a.id===s.artboardId)??-1;};
 const expected=(m:string)=>Object.assign(new Error(m),{expected:true});
 for(const tool of ['select','hand','frame','rectangle','text'] as const){
  // history: 'frame' writes one transaction (new artboard); the others only switch the active tool.
  add<never,void>({id:`design.tool.${tool}`,title:`Design: ${tool[0].toUpperCase()+tool.slice(1)} tool`,category:'Tools',level:'ui',keywords:['design','tool',tool],enabled:hasDoc,run:()=>chooseDesignTool(tool)});
 }
 // history: one transaction (new artboard, becomes active). A preset id fixes the size; width/height override it.
 add<{preset?:string;name?:string;width?:number;height?:number},void>({
  id:'design.artboard.add',title:'Design: Add artboard',category:'Insert',level:'ui',keywords:['design','artboard','page','frame'],
  params:{type:'object',properties:{preset:{type:'string',enum:ARTBOARD_PRESETS.map(p=>p.id)},name:{type:'string',maxLength:200},width:{type:'number',minimum:1,maximum:16384},height:{type:'number',minimum:1,maximum:16384}},additionalProperties:false},
  enabled:()=>hasDoc()&&(getDesignState().document?.artboards.length??0)<100,
  run:p=>{const pr=p?.preset?presetById(p.preset):undefined;if(p?.preset&&!pr)throw expected('Unknown artboard preset.');if(!addBoard({name:p?.name,width:p?.width??pr?.width,height:p?.height??pr?.height}))throw expected('The artboard limit is reached.');},
 });
 // history: one transaction (copy with new layer ids, becomes active).
 add<never,void>({id:'design.artboard.duplicate',title:'Design: Duplicate artboard',category:'Edit',level:'ui',keywords:['design','artboard','copy'],enabled:()=>board()!==null&&(getDesignState().document?.artboards.length??0)<100,run:()=>{duplicateBoard();}});
 // history: one transaction. The last artboard cannot be deleted.
 add<never,void>({id:'design.artboard.delete',title:'Design: Delete artboard',category:'Edit',level:'ui',keywords:['design','artboard','remove'],enabled:()=>(getDesignState().document?.artboards.length??0)>1,run:()=>{deleteBoard();}});
 // history: one transaction.
 add<{name:string},void>({id:'design.artboard.rename',title:'Design: Rename artboard',category:'Edit',level:'ui',keywords:['design','artboard','name'],params:{type:'object',properties:{name:{type:'string',minLength:1,maxLength:200}},required:['name'],additionalProperties:false},enabled:()=>board()!==null,run:p=>{const b=board();if(b)renameBoard(b.id,p.name);}});
 // history: none (selection only).
 add<{index?:number;id?:string},void>({id:'design.artboard.select',title:'Design: Go to artboard',category:'View',level:'ui',keywords:['design','artboard','switch'],params:{type:'object',properties:{index:{type:'integer',minimum:0,maximum:99},id:{type:'string'}},additionalProperties:false},enabled:hasDoc,run:p=>{const boards=getDesignState().document?.artboards??[];const t=p?.id?boards.find(a=>a.id===p.id):p?.index!==undefined?boards[p.index]:undefined;if(!t)throw expected('That artboard does not exist.');selectArtboard(t.id);}});
 // history: none (selection only).
 for(const [dir,name] of [[1,'next'],[-1,'previous']] as const){
  add<never,void>({id:`design.artboard.${name}`,title:`Design: ${name==='next'?'Next':'Previous'} artboard`,category:'View',level:'ui',keywords:['design','artboard'],enabled:()=>{const i=boardIndex(),n=getDesignState().document?.artboards.length??0;return i>=0&&i+dir>=0&&i+dir<n;},run:()=>{const s=getDesignState();const t=s.document?.artboards[boardIndex()+dir];if(t)selectArtboard(t.id);}});
 }
 // history: one transaction (order of artboards).
 for(const [dir,name] of [[-1,'moveUp'],[1,'moveDown']] as const){
  add<never,void>({id:`design.artboard.${name}`,title:`Design: Move artboard ${dir<0?'up':'down'}`,category:'Edit',level:'ui',keywords:['design','artboard','order'],enabled:()=>{const i=boardIndex(),n=getDesignState().document?.artboards.length??0;return i>=0&&i+dir>=0&&i+dir<n;},run:()=>{const b=board();if(b)moveBoard(b.id,dir);}});
 }
 // history: one transaction. Layers keep their position.
 add<{width:number;height:number},void>({id:'design.artboard.resize',title:'Design: Resize artboard',category:'Edit',level:'ui',keywords:['design','artboard','size'],params:{type:'object',properties:{width:{type:'number',minimum:1,maximum:16384},height:{type:'number',minimum:1,maximum:16384}},required:['width','height'],additionalProperties:false},enabled:()=>board()!==null,run:p=>{const b=board();if(b)resizeBoard(b.id,p.width,p.height);}});
 add<{preset:string},void>({id:'design.artboard.preset',title:'Design: Apply artboard size preset',category:'Edit',level:'ui',keywords:['design','artboard','preset','size'],params:{type:'object',properties:{preset:{type:'string',enum:ARTBOARD_PRESETS.map(p=>p.id)}},required:['preset'],additionalProperties:false},enabled:()=>board()!==null,run:p=>{const b=board(),pr=presetById(p.preset);if(!pr)throw expected('Unknown artboard preset.');if(b)resizeBoard(b.id,pr.width,pr.height);}});
 add<never,void>({id:'design.artboard.rotate',title:'Design: Swap artboard width and height',category:'Edit',level:'ui',keywords:['design','artboard','orientation','landscape','portrait'],enabled:()=>board()!==null,run:()=>{const b=board();if(b)rotateBoard(b.id);}});
 // history: one transaction. target: fill/stroke apply to the selected layers, background to the artboard.
 add<{target:'fill'|'stroke'|'background';color:string|null},void>({id:'design.color.apply',title:'Design: Apply colour',category:'Edit',level:'ui',keywords:['design','colour','color','fill','stroke','background','palette'],
  params:{type:'object',properties:{target:{type:'string',enum:['fill','stroke','background']},color:{type:['string','null'],pattern:'^#[0-9a-fA-F]{6}$'}},required:['target','color'],additionalProperties:false},
  enabled:()=>board()!==null,
  run:p=>{const b=board();if(!b)return;if(p.target==='background'){if(p.color)setBoardBackground(b.id,p.color);return;}if(!selection().length)throw expected('Select a layer first.');patchDesignNodes(new Map(selection().map(id=>[id,{[p.target]:p.color?.toLowerCase()??null}])));}});
 // history: none (view state).
 add<never,void>({id:'design.zoomIn',title:'Design: Zoom in',category:'View',level:'ui',keywords:['design','zoom'],enabled:()=>hasDoc()&&getDesignView().zoom<4,run:()=>stepDesignZoom(1)});
 add<never,void>({id:'design.zoomOut',title:'Design: Zoom out',category:'View',level:'ui',keywords:['design','zoom'],enabled:()=>hasDoc()&&getDesignView().zoom>0.1,run:()=>stepDesignZoom(-1)});
 add<never,void>({id:'design.zoomReset',title:'Design: Zoom to 100%',category:'View',level:'ui',keywords:['design','zoom','actual size'],enabled:hasDoc,run:()=>setDesignZoom(1)});
 add<never,void>({id:'design.zoomFit',title:'Design: Fit artboard in window',category:'View',level:'ui',keywords:['design','zoom','fit'],enabled:()=>board()!==null,run:()=>{const b=board(),v=getDesignView().viewport;if(!b)return;if(!v)throw expected('The canvas has no size yet.');setDesignZoom(fitZoom(b,v));}});
 add<{zoom:number},void>({id:'design.zoomSet',title:'Design: Set zoom',category:'View',level:'ui',keywords:['design','zoom'],params:{type:'object',properties:{zoom:{type:'number',minimum:0.1,maximum:4}},required:['zoom'],additionalProperties:false},enabled:hasDoc,run:p=>setDesignZoom(p.zoom)});
 // history: none (selection only).
 add<never,void>({id:'design.selectAll',title:'Design: Select all layers',category:'Edit',level:'ui',keywords:['design','select','all'],enabled:()=>(board()?.nodes.length??0)>0,run:()=>selectAllLayers()});
 add<never,void>({id:'design.deselect',title:'Design: Clear selection',category:'Edit',level:'ui',keywords:['design','select','none'],enabled:()=>selection().length>0,run:()=>selectDesignNode(null)});
 // history: one transaction per call (stacking order of the selected unlocked layers).
 for(const [move,label] of [['front','Bring to front'],['forward','Bring forward'],['backward','Send backward'],['back','Send to back']] as const){
  add<never,void>({id:`design.layer.${move}`,title:`Design: ${label}`,category:'Edit',level:'ui',keywords:['design','layer','order','stack'],enabled:()=>selectedRows().some(r=>!r.locked),run:()=>restackSelection(move as StackMove)});
 }
 // history: one transaction. Flags apply to locked layers too, so a locked layer can be unlocked.
 add<never,void>({id:'design.layer.toggleVisible',title:'Design: Show or hide selected layers',category:'Edit',level:'ui',keywords:['design','layer','visibility','hide','show'],enabled:()=>selection().length>0,run:()=>{const rows=selectedRows();const show=rows.some(r=>!r.visible);patchDesignNodes(new Map(rows.map(r=>[r.id,{visible:show}])),true);}});
 add<never,void>({id:'design.layer.toggleLocked',title:'Design: Lock or unlock selected layers',category:'Edit',level:'ui',keywords:['design','layer','lock','unlock'],enabled:()=>selection().length>0,run:()=>{const rows=selectedRows();const lock=rows.some(r=>!r.locked);patchDesignNodes(new Map(rows.map(r=>[r.id,{locked:lock}])),true);}});
 // history: one transaction. Locked layers stay.
 add<{dx:number;dy:number},void>({id:'design.nudge',title:'Design: Nudge selected layers',category:'Edit',level:'ui',keywords:['design','move','nudge','arrow'],params:{type:'object',properties:{dx:{type:'number',minimum:-1000,maximum:1000},dy:{type:'number',minimum:-1000,maximum:1000}},required:['dx','dy'],additionalProperties:false},enabled:()=>selection().length>0,run:p=>nudgeSelection(p.dx,p.dy)});
 // history: one transaction.
 add<{name:string},void>({id:'design.rename',title:'Design: Rename project',category:'Project',level:'ui',keywords:['design','project','name'],params:{type:'object',properties:{name:{type:'string',minLength:1,maxLength:200}},required:['name'],additionalProperties:false},enabled:hasDoc,run:p=>{const name=p.name.trim();if(name)editDesign(d=>({...d,name}));}});

 return()=>{for(const off of offs)off();};
}
