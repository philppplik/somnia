import {useSyncExternalStore} from 'react';
import {getDocumentsState} from './store';
import type {ExportExt} from './protocol';
/**
 * Bridge between the Documents Export hero / commands and the live canvas. The canvas owns the engine,
 * so it registers the one save implementation here (the same flow its toolbar button always used,
 * including the loss-warning gate). The hero, Project > Save a copy and the export popup all dispatch
 * `documents.saveCopy`, so no second export path can drift or bypass the warning.
 */
export interface DocumentsExportBridge{
 /** Produce and download the DOCX copy. Must reject (not swallow) engine failures. */
 save():Promise<void>;
 /** Produce and download the PDF. Must reject (not swallow) engine failures. */
 savePdf():Promise<void>;
 /** Produce and download the document in another format (Markdown, HTML, text, RTF, ODT). Optional so older registrations keep working. */
 saveFormat?():Promise<void>;
}
let bridge:DocumentsExportBridge|null=null;
export function registerDocumentsExport(next:DocumentsExportBridge):()=>void{
 bridge=next;return()=>{if(bridge===next)bridge=null;};
}
export const getDocumentsExport=()=>bridge;

/** Export popup and loss-warning dialog visibility. Session-only. */
export interface DocumentsExportUi{exportOpen:boolean;confirmOpen:boolean;/** A typed copy name for the next save; null means the default name. */copyName:string|null;/** A typed PDF file name for the next PDF export; null means the default name. */pdfName:string|null;/** The format chosen in the export popup. */format:'docx'|'pdf'|ExportExt;/** A typed file name for the next export in another format; null means the default name. */formatName:string|null;/** PDF pages as typed ("1-3, 5"); empty means all. */pdfPages:string;pdfMarkup:boolean;pdfTagged:boolean;/** Advanced export dialog open (AE1). */advancedOpen:boolean;/** A confirmed-loss advanced save still waiting for the warning gate. */pendingAdvanced:{name:string;meta:CorePropsMeta}|null;}
let ui:DocumentsExportUi={exportOpen:false,confirmOpen:false,copyName:null,pdfName:null,formatName:null,format:'docx',pdfPages:'',pdfMarkup:false,pdfTagged:true,advancedOpen:false,pendingAdvanced:null};
const listeners=new Set<()=>void>();
export const getDocumentsExportUi=()=>ui;
export function patchDocumentsExportUi(patch:Partial<DocumentsExportUi>){ui={...ui,...patch};listeners.forEach(fn=>fn());}
export const subscribeDocumentsExportUi=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const useDocumentsExportUi=()=>useSyncExternalStore(subscribeDocumentsExportUi,getDocumentsExportUi,getDocumentsExportUi);

/** Ready to export: a document is open, the engine is wired up and no save is running (no repeat submission). */
export const documentsExportReady=()=>getDocumentsState().status==='ready'&&!getDocumentsState().saving&&!!bridge;

/**
 * The one save-a-copy path. The original document is never overwritten; its dirty state is untouched.
 * Unsupported-content risks keep the existing warning and explicit Save anyway confirmation: every entry
 * point (toolbar button, hero popup, Project menu, palette) funnels through this gate.
 */
export async function requestDocumentsSaveCopy():Promise<void>{
 const s=getDocumentsState();
 if(s.status!=='ready'||s.saving||!bridge)return;
 if(s.risks.length){patchDocumentsExportUi({confirmOpen:true});return;}
 await bridge.save();
}
/** The confirm dialog's Save anyway: closes the warning and runs the same save. A queued advanced export keeps its name and metadata. */
export async function confirmDocumentsSaveCopy():Promise<void>{
 const pending=ui.pendingAdvanced;
 patchDocumentsExportUi({confirmOpen:false,pendingAdvanced:null});
 if(pending)await bridge?.saveAdvanced?.(pending.name,pending.meta);
 else await bridge?.save();
}
/** Advanced export (AE1) through the same risk gate: unsupported-content risks show the warning first and queue the request. */
export async function requestDocumentsSaveAdvanced(name:string,meta:CorePropsMeta):Promise<void>{
 const s=getDocumentsState();
 if(s.status!=='ready'||s.saving||!bridge?.saveAdvanced)return;
 if(s.risks.length){patchDocumentsExportUi({pendingAdvanced:{name,meta},confirmOpen:true});return;}
 await bridge.saveAdvanced(name,meta);
}

/** Exports the document as Markdown, HTML, plain text, RTF or ODT. These keep text and structure but not the page layout, so the DOCX loss warning does not apply. */
export async function requestDocumentsExportFormat(ext:ExportExt):Promise<void>{
 const s=getDocumentsState();
 if(s.status!=='ready'||s.saving||!bridge?.saveFormat)return;
 patchDocumentsExportUi({format:ext});
 await bridge.saveFormat();
}

/** Exports the document as PDF (selectable text, embedded fonts). A rendering of the current layout, so the DOCX loss warning does not apply. */
export async function requestDocumentsExportPdf():Promise<void>{
 const s=getDocumentsState();
 if(s.status!=='ready'||s.saving||!bridge)return;
 await bridge.savePdf();
}
