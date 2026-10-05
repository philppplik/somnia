import {applyOperations,getState,patchState} from '../store/appStore';
import type {EditorNode} from './editorPort';
import {addColumn,addRow,cellAt,deleteColumn,deleteRow,isTableError,mergeRight,newTable,toggleHeaderRow} from './tableOps';
import type {TableResult} from './tableOps';
function chain(id:string):EditorNode[]|null{const walk=(nodes:EditorNode[],path:EditorNode[]):EditorNode[]|null=>{for(const n of nodes){const p=[...path,n];if(n.id===id)return p;const r=walk(n.children,p);if(r)return r;}return null;};return walk(getState().nodes,[]);}
/** The table containing the selected element, plus the cell position of the selection inside it. */
export function tableContext(){const s=getState();if(!s.selectedElementId)return null;const path=chain(s.selectedElementId);if(!path)return null;const ti=path.map(n=>n.tag).lastIndexOf('table');if(ti<0)return null;const table=path[ti],parent=path[ti-1];if(!parent)return null;const src=s.files[s.designFile]??'';const text=src.slice(table.from,table.to);const sel=path[path.length-1];const pos=cellAt(text,sel.from-table.from);return{table,parent,text,pos};}
function replaceTable(ctx:NonNullable<ReturnType<typeof tableContext>>,result:TableResult,notice:string){if(isTableError(result)){patchState({notice:result.error});return;}
 // Insert the edited table before the old one, then remove the old one: one undoable transaction.
 applyOperations([{type:'insertHTML',file:getState().designFile,parentId:ctx.parent.id,beforeId:ctx.table.id,html:result.html},{type:'remove',file:getState().designFile,nodeId:ctx.table.id}]);patchState({selectedElementId:null,selectedElementIds:[],notice});}
export function insertTable(rows=3,cols=3){const s=getState();const id=s.selectedElementId;const path=id?chain(id):null;const parent=path?[...path].reverse().find(n=>!['p','h1','h2','h3','h4','h5','h6','td','th','a','span','button','li'].includes(n.tag)):s.nodes[0]?.children.find(n=>n.tag==='body');if(!parent){patchState({notice:'Select a container (for example a section or the body) to insert the table into.'});return;}
 applyOperations([{type:'insertHTML',file:s.designFile,parentId:parent.id,html:`\n${newTable(rows,cols)}\n`}]);patchState({notice:`Inserted a ${rows} by ${cols} table with a caption and header row.`});}
export type TableAction='row.above'|'row.below'|'row.delete'|'col.left'|'col.right'|'col.delete'|'header'|'merge';
export function tableAction(a:TableAction){const ctx=tableContext();if(!ctx){patchState({notice:'Select a table, row or cell first.'});return;}const {pos,text}=ctx;
 if(!pos){patchState({notice:'Select a row or cell inside the table first.'});return;}
 const needCol=()=>{if(pos.col===null){patchState({notice:'Select a cell (td or th), not a row, for column actions.'});return false;}return true;};
 switch(a){
  case 'row.above':return replaceTable(ctx,addRow(text,pos.row,false),'Added a row above. Undo restores the table.');
  case 'row.below':return replaceTable(ctx,addRow(text,pos.row,true),'Added a row below. Undo restores the table.');
  case 'row.delete':return replaceTable(ctx,deleteRow(text,pos.row),'Deleted the row. Undo restores it.');
  case 'col.left':if(needCol())replaceTable(ctx,addColumn(text,pos.col!,false),'Added a column on the left.');return;
  case 'col.right':if(needCol())replaceTable(ctx,addColumn(text,pos.col!,true),'Added a column on the right.');return;
  case 'col.delete':if(needCol())replaceTable(ctx,deleteColumn(text,pos.col!),'Deleted the column. Undo restores it.');return;
  case 'header':return replaceTable(ctx,toggleHeaderRow(text),'Toggled the header row.');
  case 'merge':if(needCol())replaceTable(ctx,mergeRight(text,pos.row,pos.col!),'Merged the cell with its right neighbour (colspan).');return;
 }}
