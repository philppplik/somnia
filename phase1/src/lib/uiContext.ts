import type {AppState} from '../store/appStore';
import type {EditorNode} from './editorPort';
export type Domain='web'|'markdown'|'raster'|'vector'|'pdf'|'code-only'|'media-readonly'|'empty';
export type Surface='canvas'|'code'|'split';
export type Selection=
 | {kind:'none'} | {kind:'text'|'image'|'media'|'container'|'form-control';tag:string;isComponent?:boolean}
 | {kind:'multi';count:number;mixedTags:boolean;anyLocked:boolean}
 | {kind:'raster-selection';shape:'rect'|'lasso'|'wand'}
 | {kind:'path';anchors:number;anchorSelected:number}
 | {kind:'vector-object';type:'rect'|'ellipse'|'text'|'group'|'path'}
 | {kind:'pdf-text'|'pdf-image'|'pdf-page'|'pdf-form-field'};
export interface UiContext {domain:Domain;surface:Surface;selection:Selection;activeTool:string|null;flags:{locked:boolean;dirty:boolean;readonly:boolean;collab:boolean;hasProblemsForSelection:boolean;breakpoint:number|null};nodeId:string|null;file:string}
export interface ToolStates {media?:{name:string;kind:'image'|'pdf'|'psd'|'docx'|'xlsx'|'raster-preview'}|null;nodes?:ReadonlyMap<string,EditorNode>;cursorNode?:EditorNode;selection?:Selection;activeTool?:string|null;readonly?:boolean;collab?:boolean;hasProblemsForSelection?:boolean;lockedIds?:ReadonlySet<string>}
export function tagToSelectionKind(tag:string):'text'|'image'|'media'|'container'|'form-control' {
 if(/^(h[1-6]|p|span|a|li|button|label)$/.test(tag))return 'text';
 if(/^(img|picture|svg|svg-inline)$/.test(tag))return 'image';
 if(/^(video|audio|iframe)$/.test(tag))return 'media';
 if(/^(input|select|textarea|form)$/.test(tag))return 'form-control';
 return 'container';
}
/** Pure O(selected IDs). Indexing and cursor lookup belong to the store, not this function. */
export function deriveContext(state:AppState,extras:ToolStates={}):UiContext {
 const file=extras.media?.name??state.activeFile;
 const domain:Domain=extras.media?(extras.media.kind==='pdf'?'pdf':extras.media.kind==='docx'||extras.media.kind==='xlsx'||extras.media.kind==='raster-preview'?'media-readonly':'raster'):!state.coreConnected?'empty':/\.svg$/i.test(file)?'vector':/\.(md|markdown)$/i.test(file)?'markdown':/\.(css|[cm]?jsx?|tsx?|json|ya?ml|txt|tex)$/i.test(file)?'code-only':'web';
 const surface:Surface=state.viewMode==='design'?'canvas':state.viewMode;
 const ids=state.selectedElementIds.length?state.selectedElementIds:state.selectedElementId?[state.selectedElementId]:[];
 const nodes=surface==='code'?(extras.cursorNode?[extras.cursorNode]:[]):ids.flatMap(id=>{const n=extras.nodes?.get(id);return n?[n]:[];});
 const node=nodes[0];const locked=nodes.some(n=>n.locked||extras.lockedIds?.has(n.id));
 const selection:Selection=extras.selection??(domain!=='web'?{kind:'none'}:nodes.length>1?{kind:'multi',count:nodes.length,mixedTags:new Set(nodes.map(n=>n.tag)).size>1,anyLocked:locked}:node?{kind:tagToSelectionKind(node.tag),tag:node.tag,isComponent:!!node.attrs['data-somnia-component']}:{kind:'none'});
 return {domain,surface,selection,activeTool:extras.activeTool??(domain==='web'?'select':null),flags:{locked,dirty:state.isDirty,readonly:extras.readonly??(domain==='media-readonly'),collab:!!extras.collab,hasProblemsForSelection:extras.hasProblemsForSelection??(node?.tag==='img'&&node.attrs.alt===undefined),breakpoint:(typeof state.responsiveScope==='number'?state.responsiveScope:null)??(state.viewport<=390?390:state.viewport<=820?820:null)},nodeId:node?.id??null,file};
}
