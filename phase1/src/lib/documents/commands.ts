import {registerCommand} from '../commandRegistry';
import {getDocumentsState,patchDocuments,stepZoom} from './store';
import {redoEdit,setAlign,setParagraphStyle,toggleList,clearList,shiftListLevel,stepFontSize,stepIndent,toggleFormat,undoEdit,editTable,insertTable,setHeaderFooter,insertImage,resizeImageToPercent,setImageAlt,removeImage,setColumnWidth,styleTable,setPageSetup,setFindOpen,setFindQuery,findStep,replaceAll,replaceCurrent} from './session';
import {pageSetupProblem} from './protocol';
import {validFindQuery,validReplaceText} from './find';
import {findMedia} from '../media';
import {tableStyleProblem,IMAGE_WIDTH_PERCENTS,MAX_IMAGE_BYTES,MIN_COL_PT,MAX_COL_PT} from './protocol';
import {CELL_BASE} from './edit';
import {goToBlock,scrollToPage} from './navigate';
import {safeCopyName} from './saveCopy';
import {commentsOpen,setCommentsOpen} from './comments';
import {setShortcutsOpen} from './shortcuts';
import {setParagraphOptionsOpen} from './paragraphOptions';
import {insertPageBreak,setParagraphOptions} from './session';
import {checkParaPatch,PARA_FLAG_KEYS} from './protocol';
import {addComment,commentSelection,deleteComment,resolveComment} from './session';
import {commentProblem,HIGHLIGHTS,linkProblem,type HighlightName} from './protocol';
import {clearFormatting,hasTextSelection,setHighlight,setLink,toggleVertAlign} from './session';
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
  add('documents.export.copy','Save a copy with a file name',async p=>{
   const n=(p as Record<string,unknown>|undefined)?.name;
   if(n!==undefined&&(typeof n!=='string'||n.length>400))throw expected('Invalid "name".');
   patchDocumentsExportUi({copyName:typeof n==='string'&&n.trim()?safeCopyName(n,getDocumentsState().name):null});await requestDocumentsSaveCopy();
  },()=>documentsExportReady(),'Project',()=>'hero.export.none'),
  add('documents.comments.panel','Show comments',()=>{setCommentsOpen(!commentsOpen());}),
  add('documents.comments.add','Comment on selection',async p=>{
   const text=(p as Record<string,unknown>|undefined)?.text;const bad=commentProblem(text);if(bad)throw expected(bad);
   await addComment(text as string);setCommentsOpen(true);
  },()=>ready()&&commentSelection()!==null),
  add('documents.comments.resolve','Resolve or reopen a comment',async p=>{
   const r=p as Record<string,unknown>|undefined;
   const id=r?.id;if(typeof id!=='number'||!Number.isInteger(id)||id<0||id>=2**31)throw expected('Invalid "id".');
   if(r?.resolved!==undefined&&typeof r.resolved!=='boolean')throw expected('Invalid "resolved".');
   await resolveComment(id,r?.resolved!==false);
  }),
  add('documents.comments.delete','Delete a comment',async p=>{
   const id=(p as Record<string,unknown>|undefined)?.id;if(typeof id!=='number'||!Number.isInteger(id)||id<0||id>=2**31)throw expected('Invalid "id".');
   await deleteComment(id);
  }),
  add('documents.zoomIn','Zoom in on the document',()=>stepZoom(1)),
  add('documents.zoomOut','Zoom out of the document',()=>stepZoom(-1)),
  add('documents.zoomReset','Reset document zoom to 100%',()=>patchDocuments({zoom:1})),
  add('documents.undo','Undo text edit',async()=>{await undoEdit();},()=>getDocumentsState().canUndo),
  add('documents.redo','Redo text edit',async()=>{await redoEdit();},()=>getDocumentsState().canRedo),
  add('documents.toggleBold','Toggle bold',async()=>{await toggleFormat('bold');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.toggleItalic','Toggle italic',async()=>{await toggleFormat('italic');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.toggleUnderline','Toggle underline',async()=>{await toggleFormat('underline');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.toggleStrike','Toggle strikethrough',async()=>{await toggleFormat('strike');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.toggleSmallCaps','Toggle small caps',async()=>{await toggleFormat('smallCaps');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.toggleSuperscript','Toggle superscript',async()=>{await toggleVertAlign('superscript');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.toggleSubscript','Toggle subscript',async()=>{await toggleVertAlign('subscript');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.highlight.set','Set highlight colour',async p=>{
   const c=(p as Record<string,unknown>|undefined)?.color;if(!(HIGHLIGHTS as readonly unknown[]).includes(c))throw expected('Invalid "color" (none, yellow, green, cyan, pink or gray).');
   await setHighlight(c as HighlightName);
  },()=>ready()&&!!getDocumentsState().caret),
  add('documents.link.set','Link the selected text',async p=>{
   const u=(p as Record<string,unknown>|undefined)?.url;const bad=linkProblem(u);if(bad||typeof u!=='string')throw expected(bad??'Invalid "url".');
   await setLink(u);
  },()=>ready()&&hasTextSelection()),
  add('documents.link.remove','Remove the link from the selected text',async()=>{await setLink('');},()=>ready()&&hasTextSelection()),
  add('documents.clearFormatting','Clear text formatting',async()=>{await clearFormatting();},()=>ready()&&hasTextSelection()),
  add('documents.paragraph.options','Paragraph options',()=>{setParagraphOptionsOpen(true);},()=>ready()&&!!getDocumentsState().caret),
  add('documents.paragraph.set','Set paragraph flow options',async p=>{
   const o=(p as Record<string,unknown>|undefined)??{};const keys=Object.keys(o);
   if(!keys.length||keys.some(k=>k!=='indentRight'&&!(PARA_FLAG_KEYS as readonly string[]).includes(k)))throw expected('Use indentRight, pageBreakBefore, keepNext, keepLines or widowControl.');
   try{checkParaPatch(o);}catch(err){throw expected(err instanceof Error?err.message:'Invalid options.');}
   await setParagraphOptions(o as import('./protocol').ParaPatch);
  },()=>ready()&&!!getDocumentsState().caret),
  add('documents.insertPageBreak','Insert page break',async()=>{await insertPageBreak();},()=>ready()&&!!getDocumentsState().caret),
  add('documents.shortcuts.show','Keyboard shortcuts',()=>{setShortcutsOpen(true);}),
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
  add('documents.style.subtitle','Apply Subtitle style',async()=>{await setParagraphStyle('Subtitle');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.style.heading4','Apply Heading 4',async()=>{await setParagraphStyle('Heading4');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.style.quote','Apply Quote style',async()=>{await setParagraphStyle('Quote');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.list.clear','Remove list',async()=>{await clearList();},()=>ready()&&!!getDocumentsState().caret),
  add('documents.find.open','Find in document',()=>{setFindOpen(true);}),
  add('documents.find.next','Find next',async()=>{if(!getDocumentsState().find.open)setFindOpen(true);if(!await findStep(1))throw expected('No matches.');}),
  add('documents.find.previous','Find previous',async()=>{if(!getDocumentsState().find.open)setFindOpen(true);if(!await findStep(-1))throw expected('No matches.');}),
  add('documents.find.set','Set search text',p=>{
   const o=(p??{}) as Record<string,unknown>;if(!validFindQuery(o.query))throw expected('Missing or invalid "query" (1-200 characters, one line).');
   if(o.matchCase!==undefined&&typeof o.matchCase!=='boolean')throw expected('Invalid "matchCase".');if(o.wholeWord!==undefined&&typeof o.wholeWord!=='boolean')throw expected('Invalid "wholeWord".');
   setFindQuery({query:o.query,...(o.matchCase!==undefined?{matchCase:o.matchCase}:{}),...(o.wholeWord!==undefined?{wholeWord:o.wholeWord}:{})});
  }),
  add('documents.find.replace','Replace current match',async p=>{const r=(p as Record<string,unknown>|undefined)?.text;if(!validReplaceText(r))throw expected('Missing or invalid "text" (up to 1000 characters, one line).');await replaceCurrent(r);},()=>ready()&&getDocumentsState().find.open&&getDocumentsState().find.count>0),
  add('documents.find.replaceAll','Replace all matches',async p=>{const r=(p as Record<string,unknown>|undefined)?.text;if(!validReplaceText(r))throw expected('Missing or invalid "text" (up to 1000 characters, one line).');await replaceAll(r);},()=>ready()&&getDocumentsState().find.open&&getDocumentsState().find.count>0),
  add('documents.pageSetup.set','Set page setup',async p=>{const bad=pageSetupProblem(p);if(bad)throw expected(bad);await setPageSetup(p as import('./protocol').PageSetupPatch);}),
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
  add('documents.image.insert','Insert image',async p=>{
   const n=(p as Record<string,unknown>|undefined)?.name;if(typeof n!=='string'||!n)throw expected('Missing or invalid "name".');
   const m=findMedia(n);if(!m||m.kind!=='image')throw expected('That image is not in the media library.');
   if(m.size>MAX_IMAGE_BYTES)throw expected('An image is limited to 5 MB.');
   const r=await fetch(m.url);if(!r.ok)throw expected('The image could not be read.');
   const b=await r.blob();if(b.size>MAX_IMAGE_BYTES)throw expected('An image is limited to 5 MB.');
   await insertImage(new Uint8Array(await b.arrayBuffer()),'');
  },()=>ready()&&(!!getDocumentsState().caret||getDocumentsState().imageBlock!==null)),
  add('documents.image.fit','Set picture width',async p=>{const n=int(p,'percent');if(!(IMAGE_WIDTH_PERCENTS as readonly number[]).includes(n))throw expected('Choose 25, 50, 75 or 100 percent.');await resizeImageToPercent(n);},()=>ready()&&getDocumentsState().imageBlock!==null),
  add('documents.image.alt','Set picture alt text',async p=>{const a=(p as Record<string,unknown>|undefined)?.alt;if(typeof a!=='string')throw expected('Missing or invalid "alt".');await setImageAlt(a);},()=>ready()&&getDocumentsState().imageBlock!==null),
  add('documents.image.remove','Remove picture',async()=>{await removeImage();},()=>ready()&&getDocumentsState().imageBlock!==null),
  add('documents.table.insert','Insert table',async p=>{await insertTable(int(p,'rows'),int(p,'cols'));},()=>ready()&&!!getDocumentsState().caret),
  add('documents.table.colWidth','Set column width',async p=>{const w=(p as Record<string,unknown>|undefined)?.width;if(typeof w!=='number'||!Number.isFinite(w))throw expected('Missing or invalid "width".');if(w<MIN_COL_PT||w>MAX_COL_PT)throw expected(`A column is ${MIN_COL_PT} to ${MAX_COL_PT} points wide.`);await setColumnWidth(w);},inCell),
  add('documents.table.style','Style table cells',async p=>{
   const o=(p??{}) as Record<string,unknown>;if(o.scope!=='cell'&&o.scope!=='table')throw expected('Missing or invalid "scope" (cell or table).');
   const bad=tableStyleProblem(o.style);if(bad)throw expected(bad);
   await styleTable(o.scope,o.style as import('./protocol').TableStyle);
  },inCell),
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
