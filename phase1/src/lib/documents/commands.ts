import {registerCommand} from '../commandRegistry';
import {getDocumentsState,patchDocuments,stepZoom} from './store';
import {redoEdit,undoEdit} from './session';
import {goToBlock,scrollToPage} from './navigate';
import {documentsExportReady,patchDocumentsExportUi,requestDocumentsSaveCopy} from './exportBridge';
/**
 * Documents studio commands. Registered while the Documents canvas is mounted (registerDocumentsCommands),
 * the same pattern as Sheets. Payload commands take `{page}` (0-based) or `{block}` (paragraph index).
 */
const ready=()=>getDocumentsState().status==='ready';
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
  add('documents.pages.goto','Go to page',p=>{const n=int(p,'page');if(n>=getDocumentsState().pages)throw expected('That page does not exist.');if(!scrollToPage(n))throw expected('The page is not on screen yet.');}),
  add('documents.outline.goto','Go to paragraph',async p=>{if(!await goToBlock(int(p,'block')))throw expected('That block has no text position.');}),
 ];
 return()=>offs.forEach(f=>f());
}
