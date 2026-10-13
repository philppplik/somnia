import {useDocuments} from '../../lib/documents/store';
import {patchDocumentsExportUi,useDocumentsExportUi} from '../../lib/documents/exportBridge';
import {copyName} from '../../lib/documents/saveCopy';
import {executeCommand} from '../../lib/commands';
import {useT} from '../../lib/useT';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border-0 bg-transparent px-2 text-[12px] text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
/**
 * The Documents Export hero popup (docs/concepts/hero-action-documents.md). Deliberately small:
 * the one available format (DOCX save-a-copy) preselected, the copy's file name, copy semantics
 * and the fidelity warnings. No "coming soon" formats. Saving dispatches `documents.saveCopy`,
 * which keeps the loss-warning gate for risky content.
 */
export function DocumentsExportDialog(){
 const {t}=useT();const doc=useDocuments();const ui=useDocumentsExportUi();
 if(!ui.exportOpen)return null;
 const close=()=>patchDocumentsExportUi({exportOpen:false});
 const save=()=>{close();void executeCommand('documents.saveCopy');};
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-export-title" className="absolute inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();close();}}}>
  <div className="grid max-w-md gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-export-dialog">
   <h2 id="documents-export-title" className="text-[14px] font-medium">{t('documents.export.title')}</h2>
   <label className="grid gap-1 text-[12px] text-ink-2">{t('documents.export.format')}
    <select className="rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink" data-testid="documents-export-format"><option value="docx">{t('documents.export.docx')}</option></select>
   </label>
   <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
    <dt className="text-ink-3">{t('documents.export.file')}</dt><dd className="break-all text-ink" data-testid="documents-export-file">{copyName(doc.name)}</dd>
   </dl>
   <p className="text-[12px] text-ink-3">{t('documents.export.note')}</p>
   {doc.risks.length>0&&<ul className="list-disc pl-5 text-[12px] text-ink-2" data-testid="documents-export-risks">{doc.risks.map(r=><li key={r}>{t('documents.risk.'+r)}</li>)}</ul>}
   <div className="flex justify-end gap-2">
    <button className={tool} autoFocus onClick={close}>{t('documents.cancel')}</button>
    <button className={tool+' border border-subtle'} disabled={doc.saving} onClick={save} data-testid="documents-export-save">{t('documents.saveCopy')}</button>
   </div>
  </div>
 </div>;
}
