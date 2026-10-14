import {useState} from 'react';
import {useDocuments} from '../../lib/documents/store';
import {patchDocumentsExportUi,useDocumentsExportUi} from '../../lib/documents/exportBridge';
import {copyName,MAX_COPY_NAME,pdfName,safeCopyName,safePdfName} from '../../lib/documents/saveCopy';
import {executeCommand} from '../../lib/commands';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput,NativeSelect} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border-0 bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
/**
 * The Documents Export hero popup (docs/concepts/hero-action-documents.md). Deliberately small:
 * the one available format (DOCX save-a-copy) preselected, the copy's file name, copy semantics
 * and the fidelity warnings. No "coming soon" formats. Saving dispatches `documents.saveCopy`,
 * which keeps the loss-warning gate for risky content.
 */
export function DocumentsExportDialog(){
 const {t}=useT();const doc=useDocuments();const ui=useDocumentsExportUi();const [typed,setTyped]=useState<string|null>(null);
 if(!ui.exportOpen)return null;
 const pdf=ui.format==='pdf';const def=pdf?pdfName(doc.name):copyName(doc.name);
 const shown=typed??def;const finalName=pdf?safePdfName(shown,doc.name):safeCopyName(shown,doc.name);
 const close=()=>{setTyped(null);patchDocumentsExportUi({exportOpen:false});};
 const save=()=>{const custom=typed===null||finalName===def?null:finalName;patchDocumentsExportUi(pdf?{exportOpen:false,pdfName:custom}:{exportOpen:false,copyName:custom});setTyped(null);void executeCommand(pdf?'documents.export.pdf':'documents.saveCopy');};
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-export-title" className="absolute inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();close();}}}>
  <div className="grid max-w-md gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-export-dialog">
   <h2 id="documents-export-title" className="text-[14px] font-medium">{t('documents.export.title')}</h2>
   <label className="grid gap-1 text-xs text-ink-2">{t('documents.export.format')}
    <NativeSelect className="rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink" value={ui.format} onChange={e=>{setTyped(null);patchDocumentsExportUi({format:e.currentTarget.value==='pdf'?'pdf':'docx'});}} data-testid="documents-export-format"><option value="docx">{t('documents.export.docx')}</option><option value="pdf">{t('documents.export.pdf')}</option></NativeSelect>
   </label>
   <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
    <dt className="text-ink-3">{t('documents.export.original')}</dt><dd className="break-all text-ink" data-testid="documents-export-original">{doc.name}</dd>
   </dl>
   <label className="grid gap-1 text-xs text-ink-2">{t('documents.export.file')}
    <NativeInput className="rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink" maxLength={MAX_COPY_NAME} value={shown} onChange={e=>setTyped(e.currentTarget.value)} onKeyDown={e=>{if(e.key==='Enter'&&!doc.saving){e.preventDefault();save();}}} data-testid="documents-export-file"/></label>
   <p className="break-all text-xs text-ink-3" data-testid="documents-export-final">{t('documents.export.willSave',{name:finalName})}</p>
   <p className="text-xs text-ink-3">{t(pdf?'documents.export.pdfNote':'documents.export.note')}</p>
   {!pdf&&doc.risks.length>0&&<ul className="list-disc pl-5 text-xs text-ink-2" data-testid="documents-export-risks">{doc.risks.map(r=><li key={r}>{t('documents.risk.'+r)}</li>)}</ul>}
   <div className="flex justify-end gap-2">
    <NativeButton className={tool} autoFocus onClick={close}>{t('documents.cancel')}</NativeButton>
    <NativeButton className={tool+' border border-subtle'} disabled={doc.saving} onClick={save} data-testid="documents-export-save">{t(pdf?'documents.export.savePdf':'documents.saveCopy')}</NativeButton>
   </div>
  </div>
 </div>;
}
