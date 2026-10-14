import {registerCommand} from '../commandRegistry';
import {getDocumentsState,patchDocuments,stepZoom} from './store';
import {typeText,redoEdit,setAlign,setParagraphStyle,toggleList,clearList,shiftListLevel,stepFontSize,stepIndent,toggleFormat,undoEdit,editTable,insertTable,setHeaderFooter,insertImage,resizeImageToPercent,setImageAlt,removeImage,setColumnWidth,styleTable,setPageSetup,setFindOpen,setFindQuery,findStep,replaceAll,replaceCurrent} from './session';
import {MIN_SPACING_PT,MAX_SPACING_PT,stylePatchProblem,STYLE_ID_RE,type StylePatch,tocProblem,type TocOptions,listOptionsProblem,type ListOptionsPatch,pageSetupProblem,LIST_STYLES,type ListStyleId} from './protocol';
import {deleteStyle,saveStyle,setCharStyle,insertToc,updateToc,removeToc,continueNumbering,restartNumbering,setListStyle,setListOptions} from './session';
import {validFindQuery,validReplaceText} from './find';
import {findMedia} from '../media';
import {tableStyleProblem,IMAGE_WIDTH_PERCENTS,MAX_IMAGE_BYTES,MIN_COL_PT,MAX_COL_PT} from './protocol';
import {CELL_BASE} from './edit';
import {styleList} from './styles';
import {goToBlock,scrollToPage} from './navigate';
import {safeCopyName,safePdfName} from './saveCopy';
import {commentsOpen,setCommentsOpen} from './comments';
import {setShortcutsOpen} from './shortcuts';
import {setParagraphOptionsOpen} from './paragraphOptions';
import {setInfoDialog} from './infoDialog';
import {symbolProblem} from './symbols';
import {authorProblem,setAuthor} from './author';
import {insertPageBreak,setParagraphOptions,setProperties,setTabStops} from './session';
import {parsePdfPages,checkParaPatch,PARA_FLAG_KEYS,propertiesProblem,tabsProblem} from './protocol';
import {addComment,commentSelection,deleteComment,goToComment,readComments,replyComment,resolveComment} from './session';
import {commentProblem,HIGHLIGHTS,linkProblem,type HighlightName} from './protocol';
import {setCharSpacing,clearFormatting,hasTextSelection,setHighlight,setLink,toggleVertAlign} from './session';
import {documentsExportReady,patchDocumentsExportUi,requestDocumentsExportPdf,requestDocumentsSaveCopy} from './exportBridge';
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
  add('documents.export.pdf','Export as PDF',async p=>{
   const r=p as Record<string,unknown>|undefined;const n=r?.name;
   if(n!==undefined&&(typeof n!=='string'||n.length>400))throw expected('Invalid "name".');
   const pg=r?.pages;if(pg!==undefined&&(typeof pg!=='string'||parsePdfPages(pg,getDocumentsState().pages)===null))throw expected('Invalid "pages": use for example "1-3, 5".');
   for(const k of ['markup','tagged'])if(r?.[k]!==undefined&&typeof r[k]!=='boolean')throw expected(`Invalid "${k}".`);
   patchDocumentsExportUi({pdfPages:typeof pg==='string'?pg:'',pdfMarkup:r?.markup===true,pdfTagged:r?.tagged!==false,pdfName:typeof n==='string'&&n.trim()?safePdfName(n,getDocumentsState().name):null});await requestDocumentsExportPdf();
  },()=>documentsExportReady(),'Project',()=>'hero.export.none'),
  add('documents.comments.panel','Show comments',()=>{setCommentsOpen(!commentsOpen());}),
  add('documents.comments.add','Comment on selection',async p=>{
   const text=(p as Record<string,unknown>|undefined)?.text;const bad=commentProblem(text);if(bad)throw expected(bad);
   await addComment(text as string);setCommentsOpen(true);
  },()=>ready()&&commentSelection()!==null),
  add('documents.comments.reply','Reply to a comment',async p=>{
   const r=p as Record<string,unknown>|undefined;const id=r?.id;
   if(typeof id!=='number'||!Number.isInteger(id)||id<0||id>=2**31)throw expected('Invalid "id".');
   const bad=commentProblem(r?.text);if(bad)throw expected(bad);
   await replyComment(id,r?.text as string);setCommentsOpen(true);
  }),
  add('documents.comments.goTo','Go to a comment',async p=>{
   const id=(p as Record<string,unknown>|undefined)?.id;if(typeof id!=='number'||!Number.isInteger(id)||id<0||id>=2**31)throw expected('Invalid "id".');
   const list=await readComments();const c=list?.find(x=>x.id===id);if(!c)throw expected('No such comment.');
   if(!(await goToComment(c.block)))throw expected('That comment has no place on a page.');
  }),
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
  add('documents.toggleAllCaps','Toggle all caps',async()=>{await toggleFormat('allCaps');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.toggleDoubleStrike','Toggle double strikethrough',async()=>{await toggleFormat('doubleStrike');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.charSpacing.set','Set character spacing',async p=>{
   const v=(p as Record<string,unknown>|undefined)?.points;if(typeof v!=='number'||!Number.isFinite(v)||v<MIN_SPACING_PT||v>MAX_SPACING_PT)throw expected(`Missing or invalid "points" (${MIN_SPACING_PT} to ${MAX_SPACING_PT}).`);
   await setCharSpacing(v);
  },()=>ready()&&!!getDocumentsState().caret),
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
   if(!keys.length||keys.some(k=>k!=='indentRight'&&k!=='shading'&&k!=='border'&&k!=='dropCap'&&!(PARA_FLAG_KEYS as readonly string[]).includes(k)))throw expected('Use indentRight, shading, border, dropCap, pageBreakBefore, keepNext, keepLines or widowControl.');
   try{checkParaPatch(o);}catch(err){throw expected(err instanceof Error?err.message:'Invalid options.');}
   await setParagraphOptions(o as import('./protocol').ParaPatch);
  },()=>ready()&&!!getDocumentsState().caret),
  add('documents.insertPageBreak','Insert page break',async()=>{await insertPageBreak();},()=>ready()&&!!getDocumentsState().caret),
  add('documents.properties.show','Document properties',()=>{setInfoDialog('properties');},()=>ready()),
  add('documents.properties.set','Set document properties',async p=>{
   const o=(p as Record<string,unknown>|undefined)??{};const bad=propertiesProblem(o);if(bad)throw expected(bad);
   await setProperties(o as import('./protocol').PropertiesPatch);
  },()=>ready()),
  add('documents.tabs.show','Tab stops',()=>{setInfoDialog('tabs');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.tabs.set','Set tab stops',async p=>{
   const tabs=(p as Record<string,unknown>|undefined)?.tabs;const bad=tabsProblem(tabs);if(bad)throw expected(bad);
   await setTabStops(tabs as import('./protocol').TabStopSpec[]);
  },()=>ready()&&!!getDocumentsState().caret),
  add('documents.author.set','Set the author name',async p=>{
   const n=(p as Record<string,unknown>|undefined)?.name;const bad=authorProblem(n);if(bad)throw expected(bad);
   if(!setAuthor(n as string))throw expected('The name could not be saved on this device.');
  },()=>true),
  add('documents.wordCount.show','Word count',()=>{setInfoDialog('wordCount');},()=>ready()),
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
  add('documents.list.style','Set the list style',async p=>{
   const st=(p as Record<string,unknown>|undefined)?.style;
   if(!(LIST_STYLES as readonly unknown[]).includes(st))throw expected(`Use one of: ${LIST_STYLES.join(', ')}.`);
   await setListStyle(st as ListStyleId);
  },()=>ready()&&!!getDocumentsState().caret),
  add('documents.list.restart','Restart list numbering',async()=>{await restartNumbering();},()=>ready()&&!!getDocumentsState().caret),
  add('documents.symbol.open','Insert symbol',()=>{setInfoDialog('symbol');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.symbol.insert','Insert symbol text',async p=>{const v=(p as Record<string,unknown>|undefined)?.text;const bad=symbolProblem(v);if(bad)throw expected(bad);await typeText(v as string);},()=>ready()&&!!getDocumentsState().caret),
  add('documents.styles.open','Styles',()=>{setInfoDialog('styles');},()=>ready()),
  add('documents.styles.save','Create or change a style',async p=>{
   const bad=stylePatchProblem(p);if(bad)throw expected(bad);
   await saveStyle(p as StylePatch);
  },()=>ready()),
  add('documents.styles.delete','Delete a custom style',async p=>{
   const id=(p as Record<string,unknown>|undefined)?.id;if(typeof id!=='string'||!STYLE_ID_RE.test(id))throw expected('Missing or invalid "id".');
   await deleteStyle(id);
  },()=>ready()),
  add('documents.styles.apply','Apply a style',async p=>{
   const r=(p??{}) as Record<string,unknown>;
   if(typeof r.id!=='string'||!STYLE_ID_RE.test(r.id))throw expected('Missing or invalid "id".');
   const it=styleList().find(s=>s.id===r.id);
   if(it?.kind==='character')await setCharStyle(r.id);else await setParagraphStyle(r.id);
  },()=>ready()&&!!getDocumentsState().caret),
  add('documents.toc.open','Table of contents',()=>{setInfoDialog('toc');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.toc.insert','Insert table of contents',async p=>{
   const r=(p??{}) as Record<string,unknown>;const o={levels:r.levels??3,title:r.title??'',pages:r.pages??true};
   const bad=tocProblem(o);if(bad)throw expected(bad);
   await insertToc(o as TocOptions);
  },()=>ready()&&!!getDocumentsState().caret),
  add('documents.toc.update','Update table of contents',async()=>{await updateToc();},()=>ready()&&!!getDocumentsState().caret),
  add('documents.toc.remove','Remove table of contents',async()=>{await removeToc();},()=>ready()&&!!getDocumentsState().caret),
  add('documents.list.continue','Continue list numbering',async()=>{await continueNumbering();},()=>ready()&&!!getDocumentsState().caret&&getDocumentsState().para?.list==='numbered'),
  add('documents.list.options','List numbering options',()=>{setInfoDialog('list');},()=>ready()&&!!getDocumentsState().caret&&(getDocumentsState().para?.list==='bullet'||getDocumentsState().para?.list==='numbered')),
  add('documents.list.options.set','Set list level options',async p=>{
   const bad=listOptionsProblem(p);if(bad)throw expected(bad);
   await setListOptions(p as ListOptionsPatch);
  },()=>ready()&&!!getDocumentsState().caret),
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
