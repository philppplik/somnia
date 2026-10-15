import {registerCommand} from '../commandRegistry';
import {getDocumentsState,patchDocuments,stepZoom} from './store';
import {setTableLayout,insertSectionBreak,removeSectionBreak,setHfVariants,typeText,redoEdit,setAlign,setParagraphStyle,toggleList,clearList,shiftListLevel,stepFontSize,stepIndent,toggleFormat,undoEdit,editTable,insertTable,setHeaderFooter,insertImage,resizeImageToPercent,setImageAlt,removeImage,setColumnWidth,styleTable,setPageSetup,setFindOpen,setFindQuery,findStep,replaceAll,replaceCurrent} from './session';
import {proofWordOk,checkFormatPatch,MIN_SPACING_PT,MAX_SPACING_PT,MIN_SCALE_PCT,MAX_SCALE_PCT,lineRuleProblem,imageWrapProblem,imageCropProblem,type ImageWrap,type ImageAlign,type LineRule,stylePatchProblem,STYLE_ID_RE,type StylePatch,tocProblem,type TocOptions,listOptionsProblem,type ListOptionsPatch,pageSetupProblem,LIST_STYLES,type ListStyleId} from './protocol';
import {deleteStyle,saveStyle,setCharStyle,insertToc,updateToc,removeToc,continueNumbering,restartNumbering,setListStyle,setListOptions} from './session';
import {validFindQuery,validReplaceText} from './find';
import {findMedia} from '../media';
import {tableLayoutProblem,SECTION_BREAKS,hfVariantsProblem,tableStyleProblem,IMAGE_WIDTH_PERCENTS,MAX_IMAGE_BYTES,MIN_COL_PT,MAX_COL_PT} from './protocol';
import {CELL_BASE} from './edit';
import {styleList} from './styles';
import {goToBlock,scrollToPage} from './navigate';
import {savePagePng,safeCopyName,safeFormatName,safePdfName} from './saveCopy';
import {EXPORT_EXTS,PROOF_LANGS,type ExportExt} from './protocol';
import {pickAndImport} from './importFormat';
import {CASE_MODES,type CaseMode} from './textCase';
import {commentsOpen,setCommentsOpen} from './comments';
import {setShortcutsOpen} from './shortcuts';
import {setParagraphOptionsOpen} from './paragraphOptions';
import {setInfoDialog} from './infoDialog';
import {savedAuthor} from './author';
import {zoomToFit} from './zoomFit';
import {pickAndInsertText} from './insertFromFile';
import {symbolProblem,specialChar,timeText} from './symbols';
import {getLocale as currentLocale} from '../i18n';
import {authorProblem,setAuthor} from './author';
import {insertPageBreak,setParagraphOptions,setProperties,setTabStops} from './session';
import {parsePdfPages,checkParaPatch,PARA_FLAG_KEYS,propertiesProblem,tabsProblem} from './protocol';
import {addComment,commentSelection,deleteComment,goToComment,readComments,replyComment,resolveComment} from './session';
import {coverProblem,PARAGRAPH_SPACINGS,type ParagraphSpacing,bookmarkProblem,commentProblem,HIGHLIGHTS,linkProblem,type HighlightName} from './protocol';
import {sortParagraphs,settleDocument,getEngine,insertCoverPage,setParagraphSpacing,selectUnitAtCaret,addBookmark,deleteBookmark,goToComment as goToBlock0,readBookmarks,bookmarkSelection,goToAdjacentChange,setViewMarks,textToTable,setTrackChanges,resolveChange,resolveAllChanges,changeAtCaret,setCharLook,setCharSpacing,setCharScale,setLineRule,setImageWrap,setImageCrop,setProofing,setShowHidden,changeCase,addToDictionary,copyFormatting,pasteFormatting,clearFormatting,hasTextSelection,setHighlight,setLink,toggleVertAlign} from './session';
import {documentsExportReady,patchDocumentsExportUi,requestDocumentsExportFormat,requestDocumentsExportPdf,requestDocumentsSaveCopy} from './exportBridge';
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
  add('documents.export.pagePng','Save a page as a PNG image',async p=>{
   const st=getDocumentsState();const pg=(p as Record<string,unknown>|undefined)?.page;
   const n=pg===undefined?(st.caretBox?.page??0)+1:pg;
   if(typeof n!=='number'||!Number.isInteger(n)||n<1||n>st.pages)throw expected('Invalid "page".');
   const e=getEngine();if(!e)throw expected('Open a document first.');
   await settleDocument();const size=getDocumentsState().pageSizes[n-1];if(!size)throw expected('That page has no size.');
   await savePagePng(e,st.name,n-1,size.width,size.height);
  },()=>ready()),
  add('documents.import.file','Open a Markdown, HTML, text, RTF or ODT file as a document',async()=>{
   const r=await pickAndImport();if(r&&'error' in r)throw expected(r.error);
  }),
  add('documents.export.format','Export as another format',async p=>{
   const r=p as Record<string,unknown>|undefined;const f=r?.format;
   if(typeof f!=='string'||!(EXPORT_EXTS as readonly string[]).includes(f))throw expected('Invalid "format": use md, html, txt, rtf or odt.');
   const n=r?.name;if(n!==undefined&&(typeof n!=='string'||n.length>400))throw expected('Invalid "name".');
   if(typeof n==='string'&&n.trim())patchDocumentsExportUi({formatName:safeFormatName(n,getDocumentsState().name,f as ExportExt)});
   await requestDocumentsExportFormat(f as ExportExt);
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
  add('documents.design.paragraphSpacing','Set the document paragraph spacing',async p=>{
   const v=(p as Record<string,unknown>|undefined)?.value;if(typeof v!=='string'||!(PARAGRAPH_SPACINGS as readonly string[]).includes(v))throw expected('Invalid "value".');
   await setParagraphSpacing(v as ParagraphSpacing);
  },()=>ready()),
  add('documents.paragraphs.sortAsc','Sort the selected paragraphs A to Z',async()=>{await sortParagraphs(false);},()=>ready()&&!!getDocumentsState().caret),
  add('documents.paragraphs.sortDesc','Sort the selected paragraphs Z to A',async()=>{await sortParagraphs(true);},()=>ready()&&!!getDocumentsState().caret),
  add('documents.insert.coverPage','Insert a cover page',async p=>{
   const r=(p??{}) as Record<string,unknown>;const o={title:r.title,subtitle:r.subtitle??'',author:r.author??savedAuthor(),date:r.date??''};
   const bad=coverProblem(o);if(bad)throw expected(bad);
   await insertCoverPage(o as import('./protocol').CoverOptions);
  },()=>ready()),
  add('documents.bookmarks.open','Open bookmarks',()=>{setInfoDialog('bookmarks');},()=>ready()),
  add('documents.bookmarks.add','Add a bookmark at the selection',async p=>{
   const name=(p as Record<string,unknown>|undefined)?.name;const bad=bookmarkProblem(name);if(bad||typeof name!=='string')throw expected(bad??'Invalid "name".');
   await addBookmark(name);
  },()=>ready()&&bookmarkSelection()!==null),
  add('documents.bookmarks.goTo','Go to a bookmark',async p=>{
   const name=(p as Record<string,unknown>|undefined)?.name;const bad=bookmarkProblem(name);if(bad||typeof name!=='string')throw expected(bad??'Invalid "name".');
   const b=(await readBookmarks())?.find(x=>x.name===name);if(!b)throw expected('No such bookmark.');
   if(!(await goToBlock0(b.block)))throw expected('That bookmark has no place on a page.');
  },()=>ready()),
  add('documents.bookmarks.delete','Delete a bookmark',async p=>{
   const name=(p as Record<string,unknown>|undefined)?.name;const bad=bookmarkProblem(name);if(bad||typeof name!=='string')throw expected(bad??'Invalid "name".');
   await deleteBookmark(name);
  },()=>ready()),
  add('documents.select.word','Select the word at the caret',()=>{if(!selectUnitAtCaret('word'))throw expected('Put the caret in an editable paragraph.');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.select.sentence','Select the sentence at the caret',()=>{if(!selectUnitAtCaret('sentence'))throw expected('Put the caret in an editable paragraph.');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.select.paragraph','Select the paragraph at the caret',()=>{if(!selectUnitAtCaret('paragraph'))throw expected('Put the caret in an editable paragraph.');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.zoomIn','Zoom in on the document',()=>stepZoom(1)),
  add('documents.zoomOut','Zoom out of the document',()=>stepZoom(-1)),
  add('documents.zoomFitWidth','Zoom the document to the window width',()=>{if(!zoomToFit('width'))throw expected('Open a document first.');},()=>ready()),
  add('documents.zoomFitPage','Zoom the document to fit a whole page',()=>{if(!zoomToFit('page'))throw expected('Open a document first.');},()=>ready()),
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
  add('documents.charLook.open','Underline and shading',()=>{setInfoDialog('charlook');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.charLook.set','Set underline style, underline colour or character shading',async p=>{
   const o=(p??{}) as Record<string,unknown>;const keys=Object.keys(o);
   if(!keys.length||keys.some(k=>k!=='underline'&&k!=='underlineStyle'&&k!=='underlineColor'&&k!=='charShading'))throw expected('Use underline, underlineStyle, underlineColor or charShading.');
   try{checkFormatPatch(o);}catch(err){throw expected(err instanceof Error?err.message:'Invalid options.');}
   await setCharLook(o as import('./protocol').FormatPatch);
  },()=>ready()&&!!getDocumentsState().caret),
  add('documents.toggleAllCaps','Toggle all caps',async()=>{await toggleFormat('allCaps');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.toggleHidden','Hide or unhide the selected text',async()=>{await toggleFormat('hidden');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.noProof.toggle','Do not check spelling in the selected text',async()=>{await toggleFormat('noProof');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.language.set','Set the proofing language of the selected text',async p=>{
   const l=(p as Record<string,unknown>|undefined)?.lang;
   if(l!=='none'&&!(PROOF_LANGS as readonly unknown[]).includes(l))throw expected('Invalid "lang": use none, en-US, en-GB, de-DE, es-ES, fr-FR or pt-BR.');
   await setCharLook({lang:l as 'none'});
  },()=>ready()&&!!getDocumentsState().caret),
  add('documents.case.set','Change the case of the selected text',async p=>{
   const m=(p as Record<string,unknown>|undefined)?.mode;
   if(typeof m!=='string'||!(CASE_MODES as readonly string[]).includes(m))throw expected('Invalid "mode": use upper, lower, title, sentence or toggle.');
   await changeCase(m as CaseMode);
  },()=>ready()&&!!getDocumentsState().caret),
  add('documents.view.marks','Show or hide formatting marks',async()=>{const s=getDocumentsState();await setViewMarks(!s.showMarks,s.showMarkup);},()=>ready()),
  add('documents.view.markup','Show or hide tracked-change markup',async()=>{const s=getDocumentsState();await setViewMarks(s.showMarks,!s.showMarkup);},()=>ready()),
  add('documents.review.next','Go to the next tracked change',async()=>{if(!await goToAdjacentChange(1))throw expected('There are no tracked changes.');},()=>ready()),
  add('documents.review.previous','Go to the previous tracked change',async()=>{if(!await goToAdjacentChange(-1))throw expected('There are no tracked changes.');},()=>ready()),
  add('documents.insert.textFile','Insert text from a file',async()=>{const r=await pickAndInsertText();if(r&&'error' in r)throw expected(r.error);},()=>ready()&&!!getDocumentsState().caret),
  add('documents.review.track','Track changes on or off',async()=>{await setTrackChanges(!getDocumentsState().trackChanges);},()=>ready()),
  add('documents.review.open','Review tracked changes',()=>{setInfoDialog('review');},()=>ready()),
  add('documents.review.accept','Accept the tracked change at the cursor',async()=>{const ch=await changeAtCaret();if(ch)await resolveChange(ch,true);},()=>ready()&&!!getDocumentsState().caret),
  add('documents.review.reject','Reject the tracked change at the cursor',async()=>{const ch=await changeAtCaret();if(ch)await resolveChange(ch,false);},()=>ready()&&!!getDocumentsState().caret),
  add('documents.review.acceptAll','Accept all tracked changes',async()=>{await resolveAllChanges(true);},()=>ready()),
  add('documents.review.rejectAll','Reject all tracked changes',async()=>{await resolveAllChanges(false);},()=>ready()),
  add('documents.hidden.show','Show or hide hidden text',async()=>{await setShowHidden(!getDocumentsState().showHidden);},()=>ready()),
  add('documents.toggleDoubleStrike','Toggle double strikethrough',async()=>{await toggleFormat('doubleStrike');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.charSpacing.set','Set character spacing',async p=>{
   const v=(p as Record<string,unknown>|undefined)?.points;if(typeof v!=='number'||!Number.isFinite(v)||v<MIN_SPACING_PT||v>MAX_SPACING_PT)throw expected(`Missing or invalid "points" (${MIN_SPACING_PT} to ${MAX_SPACING_PT}).`);
   await setCharSpacing(v);
  },()=>ready()&&!!getDocumentsState().caret),
  add('documents.charScale.set','Set character width',async p=>{
   const v=(p as Record<string,unknown>|undefined)?.percent;if(typeof v!=='number'||!Number.isInteger(v)||v<MIN_SCALE_PCT||v>MAX_SCALE_PCT)throw expected(`Missing or invalid "percent" (${MIN_SCALE_PCT} to ${MAX_SCALE_PCT}).`);
   await setCharScale(v);
  },()=>ready()&&!!getDocumentsState().caret),
  add('documents.lineRule.set','Set line height rule',async p=>{
   const o=(p as Record<string,unknown>|undefined)??{};const rule={rule:o.rule,value:o.value};const bad=lineRuleProblem(rule);if(bad)throw expected(`${bad} Pass "rule" and "value".`);
   await setLineRule(rule as LineRule);
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
   if(!keys.length||keys.some(k=>k!=='indentRight'&&k!=='shading'&&k!=='border'&&k!=='dropCap'&&!(PARA_FLAG_KEYS as readonly string[]).includes(k)))throw expected('Use indentRight, shading, border, dropCap, pageBreakBefore, keepNext, keepLines, widowControl, contextualSpacing or suppressLineNumbers.');
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
  add('documents.insert.nbsp','Insert non-breaking space',async()=>{await typeText(specialChar('nbsp'));},()=>ready()&&!!getDocumentsState().caret),
  add('documents.insert.nbHyphen','Insert non-breaking hyphen',async()=>{await typeText(specialChar('nbHyphen'));},()=>ready()&&!!getDocumentsState().caret),
  add('documents.insert.softHyphen','Insert optional hyphen',async()=>{await typeText(specialChar('softHyphen'));},()=>ready()&&!!getDocumentsState().caret),
  add('documents.insert.time','Insert the current time',async()=>{await typeText(timeText(new Date(),false,currentLocale()));},()=>ready()&&!!getDocumentsState().caret),
  add('documents.insert.dateTime','Insert the current date and time',async()=>{await typeText(timeText(new Date(),true,currentLocale()));},()=>ready()&&!!getDocumentsState().caret),
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
  add('documents.headerFooter.variants','Set first-page and odd/even headers and footers',async p=>{
   const bad=hfVariantsProblem(p);if(bad)throw expected(bad);await setHfVariants(p as import('./protocol').HfVariantsPatch);
  },()=>ready()&&!!getDocumentsState().caret),
  add('documents.table.layout','Set table layout',async p=>{
   const bad=tableLayoutProblem(p);if(bad)throw expected(bad);await setTableLayout(p as import('./protocol').TableLayoutPatch);
  },()=>ready()&&!!getDocumentsState().caret),
  add('documents.sectionBreak.insert','Insert section break',async p=>{
   const k=(p as Record<string,unknown>|undefined)?.kind;if(!(SECTION_BREAKS as readonly unknown[]).includes(k))throw expected('Invalid "kind": use nextPage, continuous, evenPage or oddPage.');
   await insertSectionBreak(k as typeof SECTION_BREAKS[number]);
  },()=>ready()&&!!getDocumentsState().caret),
  add('documents.sectionBreak.remove','Remove section break',async()=>{await removeSectionBreak();},()=>ready()&&!!getDocumentsState().caret),
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
  add('documents.image.wrap','Set picture wrap',async p=>{
   const o=(p as Record<string,unknown>|undefined)??{};const bad=imageWrapProblem(o.wrap,o.align??'left');if(bad)throw expected(`${bad} Pass "wrap" and optionally "align".`);
   await setImageWrap(o.wrap as ImageWrap,(o.align??'left') as ImageAlign);
  },()=>ready()&&getDocumentsState().imageBlock!==null),
  add('documents.image.crop','Crop picture',async p=>{
   const o=(p as Record<string,unknown>|undefined)??{};const crop=[o.left,o.top,o.right,o.bottom].map(v=>v===undefined?0:v);const bad=imageCropProblem(crop);if(bad)throw expected(`${bad} Pass "left", "top", "right" and "bottom" in percent.`);
   await setImageCrop(crop as number[]);
  },()=>ready()&&getDocumentsState().imageBlock!==null),
  add('documents.formatPainter.copy','Copy formatting',async()=>{if(!copyFormatting())throw expected('There is no formatting to copy here.');},()=>ready()&&!!getDocumentsState().caret),
  add('documents.formatPainter.paste','Paste formatting',async()=>{await pasteFormatting();},()=>ready()&&!!getDocumentsState().caret&&getDocumentsState().painted),
  add('documents.proofing.toggle','Toggle spelling and grammar marks',async()=>{await setProofing(!getDocumentsState().proofing);},()=>ready()),
  add('documents.proofing.addWord','Add a word to the spelling dictionary',async p=>{
   const w=(p as Record<string,unknown>|undefined)?.word;if(!proofWordOk(w))throw expected('Missing or invalid "word" (1 to 40 characters, no spaces).');
   if(!addToDictionary(w))throw expected('The word could not be saved (the list is full or storage is unavailable).');
  },()=>true),
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
  add('documents.table.even_cols','Make all columns the same width',async()=>{await editTable('even_cols');},inCell),
  add('documents.table.fromText','Convert selected text to a table',async()=>{await textToTable();},()=>ready()&&!!getDocumentsState().caret),
  add('documents.table.sort_asc','Sort table rows A to Z by this column',async()=>{await editTable('sort_asc');},inCell),
  add('documents.table.sort_desc','Sort table rows Z to A by this column',async()=>{await editTable('sort_desc');},inCell),
  add('documents.table.table_to_text','Convert table to text',async()=>{await editTable('table_to_text');},inCell),
  add('documents.table.delete_table','Delete table',async()=>{await editTable('delete_table');},inCell),
  add('documents.table.delete_col','Delete column',async()=>{await editTable('delete_col');},inCell),
 ];
 return()=>offs.forEach(f=>f());
}
