import {registerCommand} from '../commandRegistry';
import {getDocumentsState,patchDocuments,stepZoom} from './store';
import {redoEdit,setAlign,setParagraphStyle,toggleList,shiftListLevel,stepFontSize,stepIndent,toggleFormat,undoEdit,editTable,insertTable,setHeaderFooter} from './session';
import {CELL_BASE} from './edit';
import {goToBlock,scrollToPage} from './navigate';
import {documentsExportReady,patchDocumentsExportUi,requestDocumentsSaveCopy} from './exportBridge';
/**
 * Documents studio commands. Registered while the Documents canvas is mounted (registerDocumentsCommands),
 * the same pattern as Sheets. Payload commands take `{page}` (0-based) or `{block}` (paragraph index).
 */
const ready=()=>getDocumentsState().status==='ready';
const inCell=()=>{const c=getDocumentsState().caret;return ready()&&!!c&&c.block>=CELL_BASE;};
const expected=(m:string)=>Object.assign(new Error(m),{expected:true});
const int=(v:unknown,k:string)=>{const n=(v as Record<string,unknown>|undefined)?.[k];if(typeof n!=='number'||!Number.isInteger(n)||n<0)throw expected(`Missing or invalid "${k}".`);return n;};
export function registerDocumentsCommands(){
 const add=(id:string,title:string,run:(p?:unknown)=>void|Promise<void>,enabled:()=>boolean=ready,category:'Project'|'View'='View',disabledReason?:()=>string)=>registerCommand({id,title,category,studio:'documents',enabled,keywords:['document','docx'],...(disabledReason?{disabledReason}:{}),run});
 const offs=[
  // Export hero (docs/concepts/hero-action-documents.md): real DOCX copy through the shared risk-gated save path.
  add('documents.export.open','Export document',()=>{patchDocumentsExportUi({exportOpen:true});},()=>documentsExportReady(),'Project',()=>'hero.export.none'),
  add('documents.saveCopy','Save a copy of the document',()=>requestDocumentsSaveCopy(),()=>documentsExportReady(),'Project',()=>'hero.export.none'),
  add('documents.zoomIn','Zoom in on the document',()=>stepZoom(1)),
  add('documents.zoomOut','Zoom out of the document',()=>stepZoom(-1)),
  add('documents.zoomReset','Reset document zoom to 100%',()=>patchDocuments({zoom:1})),
  add('documents.undo','Undo text edit',async()=>{await undoEdit();},()=>getDocumentsState().canUndo),
  add('documents.redo','Redo text edit',async()=>{await redoEdit();},()=>getDocumentsState().canRedo),
  add('documents.toggleBold','Toggle bold',async()=>{await toggleFormat('bold');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.toggleItalic','Toggle italic',async()=>{await toggleFormat('italic');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.toggleUnderline','Toggle underline',async()=>{await toggleFormat('underline');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.fontSize.increase','Increase font size',async()=>{await stepFontSize(1);},()=>ready()&&!!getDocumentsState().caret),
  add('documents.fontSize.decrease','Decrease font size',async()=>{await stepFontSize(-1);},()=>ready()&&!!getDocumentsState().caret),
  add('documents.align.left','Align left',async()=>{await setAlign('left');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.align.center','Align center',async()=>{await setAlign('center');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.align.right','Align right',async()=>{await setAlign('right');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.align.justify','Align justify',async()=>{await setAlign('justify');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.indent.increase','Increase indent',async()=>{await stepIndent(1);},()=>ready()&&!!getDocumentsState().caret),
  add('documents.indent.decrease','Decrease indent',async()=>{await stepIndent(-1);},()=>ready()&&!!getDocumentsState().caret),
  add('documents.style.normal','Apply Normal style',async()=>{await setParagraphStyle('Normal');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.style.heading1','Apply Heading 1',async()=>{await setParagraphStyle('Heading1');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.style.heading2','Apply Heading 2',async()=>{await setParagraphStyle('Heading2');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.style.heading3','Apply Heading 3',async()=>{await setParagraphStyle('Heading3');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.style.title','Apply Title style',async()=>{await setParagraphStyle('Title');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.list.bullet','Toggle bulleted list',async()=>{await toggleList('bullet');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.list.numbered','Toggle numbered list',async()=>{await toggleList('numbered');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.list.indent','Demote list item',async()=>{await shiftListLevel(1);},()=>ready()&&!!getDocumentsState().caret),
  add('documents.list.outdent','Promote list item',async()=>{await shiftListLevel(-1);},()=>ready()&&!!getDocumentsState().caret),
  add('documents.pages.goto','Go to page',p=>{const n=int(p,'page');if(n>=getDocumentsState().pages)throw expected('That page does not exist.');if(!scrollToPage(n))throw expected('The page is not on screen yet.');}),
  add('documents.outline.goto','Go to paragraph',async p=>{if(!await goToBlock(int(p,'block')))throw expected('That block has no text position.');}),
  add('documents.headerFooter.set','Set header and footer',async p=>{
   const o=(p??{}) as Record<string,unknown>;const bad=(k:string)=>expected(`Invalid "${k}".`);
   if(o.header!==undefined&&typeof o.header!=='string')throw bad('header');if(o.footer!==undefined&&typeof o.footer!=='string')throw bad('footer');if(o.pageNumber!==undefined&&typeof o.pageNumber!=='boolean')throw bad('pageNumber');
   if(o.header===undefined&&o.footer===undefined&&o.pageNumber===undefined)throw expected('Give a header, a footer or pageNumber.');
   await setHeaderFooter({header:o.header as string|undefined,footer:o.footer as string|undefined,pageNumber:o.pageNumber as boolean|undefined});
  },()=>ready()&&!!getDocumentsState().caret),
  add('documents.table.insert','Insert table',async p=>{await insertTable(int(p,'rows'),int(p,'cols'));},()=>ready()&&!!getDocumentsState().caret),
  add('documents.table.row_above','Insert row above',async()=>{await editTable('row_above');},inCell),
  add('documents.table.row_below','Insert row below',async()=>{await editTable('row_below');},inCell),
  add('documents.table.delete_row','Delete row',async()=>{await editTable('delete_row');},inCell),
  add('documents.table.col_left','Insert column left',async()=>{await editTable('col_left');},inCell),
  add('documents.table.col_right','Insert column right',async()=>{await editTable('col_right');},inCell),
  add('documents.table.merge_right','Merge with cell on the right',async()=>{await editTable('merge_right');},inCell),
  add('documents.table.split_cell','Split merged cell',async()=>{await editTable('split_cell');},inCell),
  add('documents.table.merge_down','Merge with cell below',async()=>{await editTable('merge_down');},inCell),
  add('documents.table.split_down','Split vertically merged cell',async()=>{await editTable('split_down');},inCell),
  add('documents.table.delete_col','Delete column',async()=>{await editTable('delete_col');},inCell),
 ];
 return()=>offs.forEach(f=>f());
}
