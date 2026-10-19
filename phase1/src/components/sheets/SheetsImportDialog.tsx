import {useEffect,useRef,useState} from 'react';
import {Button} from '../ui/button';
import {Dialog,DialogContent,DialogTitle} from '../ui/dialog';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {useT} from '../../lib/useT';
import {setSheetsImportState,useSheetsImportState} from '../../lib/sheets/importState';
import {getSheetsPanelController} from '../../lib/sheets/panelController';
import {decodeDelimitedFile,sniffDelimiter,planImport,importPreview,importSheetName,MAX_IMPORT_ROWS,MAX_IMPORT_COLS,type Delimiter,type ImportPlan,type ImportProblem} from '../../lib/sheets/csvImport';
import '../../lib/sheets/panelI18n';

interface Picked{name:string;text:string;encoding:'utf-8'|'windows-1252'}
const field='w-full min-w-0 rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink';
const PREVIEW_ROWS=8,PREVIEW_COLS=6;

/**
 * CSV/TSV import: pick a file, confirm the detected delimiter and the target, then write
 * the block through the panel controller (new sheet, or from the active cell). The engine
 * only ever sees validated rectangular blocks, and one band is one undo step.
 */
export function SheetsImportDialog({existingSheets}:{existingSheets:readonly string[]}){
 const {t}=useT(),state=useSheetsImportState();
 const [picked,setPicked]=useState<Picked|null>(null);
 const [delimChoice,setDelimChoice]=useState<'auto'|Delimiter>('auto');
 const [target,setTarget]=useState<'newSheet'|'cell'>('newSheet');
 const [sheetName,setSheetName]=useState('');
 const [error,setError]=useState('');
 const fileRef=useRef<HTMLInputElement>(null);
 const close=()=>{setSheetsImportState({open:false,working:false});setPicked(null);setError('');setDelimChoice('auto');setTarget('newSheet');};
 useEffect(()=>{if(!state.open)setPicked(null);},[state.open]);
 const delim:Delimiter=delimChoice==='auto'?sniffDelimiter(picked?.text??''):delimChoice;
 const result=picked?planImport(picked.text,delim):null;
 const plan:ImportPlan|null=result?.ok?result.plan:null;
 const problem:ImportProblem|null=result&&!result.ok?result.reason:null;
 const read=(f:File)=>{
  setError('');
  void f.arrayBuffer().then(buf=>{
   const {text,encoding}=decodeDelimitedFile(new Uint8Array(buf));
   setPicked({name:f.name,text,encoding});
   setSheetName(importSheetName(f.name,existingSheets));
  }).catch(()=>setError(t('sheets.import.failed')));
 };
 const run=async()=>{
  const c=getSheetsPanelController();
  if(!c?.ready()||!plan||state.working)return;
  setSheetsImportState({working:true});setError('');
  try{
   await c.importDelimited(plan,target==='newSheet'?{kind:'newSheet',name:sheetName.trim()||importSheetName(picked?.name??'',existingSheets)}:{kind:'cell'});
   close();
  }catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{setSheetsImportState({working:false});}
 };
 return <Dialog open={state.open} onOpenChange={next=>{if(!next)close();else setSheetsImportState({open:true});}}><DialogContent aria-label={t('sheets.import.title')} data-testid="sheets-import">
  <DialogTitle>{t('sheets.import.title')}</DialogTitle>
  <div className="flex max-h-[70vh] flex-col gap-3 overflow-auto text-xs">
   <NativeInput ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" className="hidden" tabIndex={-1} aria-label={t('sheets.import.choose')} onChange={e=>{const f=e.currentTarget.files?.[0];if(f)read(f);e.currentTarget.value='';}}/>
   <div className="flex items-center gap-2">
    <Button variant="outline" size="compact" disabled={state.working} onClick={()=>fileRef.current?.click()} data-testid="sheets-import-choose">{t('sheets.import.choose')}</Button>
    {picked&&<span className="min-w-0 break-all text-ink-2" data-testid="sheets-import-file">{picked.name}{picked.encoding==='windows-1252'&&<span className="text-ink-3"> · {t('sheets.import.encoding')}</span>}</span>}
   </div>
   {picked&&<>
    <label className="flex flex-col gap-1">{t('sheets.import.delimiter')}
     <NativeSelect className={field} value={delimChoice} disabled={state.working} onChange={e=>setDelimChoice(e.currentTarget.value as 'auto'|Delimiter)} data-testid="sheets-import-delimiter">
      <option value="auto">{t('sheets.import.delimAuto',{detected:t('sheets.import.delim.'+sniffDelimiter(picked.text))})}</option>
      <option value="comma">{t('sheets.import.delim.comma')}</option>
      <option value="semicolon">{t('sheets.import.delim.semicolon')}</option>
      <option value="tab">{t('sheets.import.delim.tab')}</option>
     </NativeSelect></label>
    <label className="flex flex-col gap-1">{t('sheets.import.target')}
     <NativeSelect className={field} value={target} disabled={state.working} onChange={e=>setTarget(e.currentTarget.value as 'newSheet'|'cell')} data-testid="sheets-import-target">
      <option value="newSheet">{t('sheets.import.targetNewSheet')}</option>
      <option value="cell">{t('sheets.import.targetCell')}</option>
     </NativeSelect></label>
    {target==='newSheet'&&<label className="flex flex-col gap-1">{t('sheets.import.sheetName')}
     <NativeInput className={field} value={sheetName} maxLength={31} disabled={state.working} onChange={e=>setSheetName(e.currentTarget.value)} data-testid="sheets-import-name"/></label>}
   </>}
   {problem&&<p role="alert" className="text-red-600" data-testid="sheets-import-problem">{t('sheets.import.problem.'+problem,{rows:String(MAX_IMPORT_ROWS),cols:String(MAX_IMPORT_COLS)})}</p>}
   {plan&&<>
    <p className="text-ink-2" data-testid="sheets-import-size">{t('sheets.import.size',{rows:String(plan.rows),cols:String(plan.cols)})}</p>
    {plan.truncated&&<p role="alert" className="text-ink-3">{t('sheets.import.truncated',{rows:String(plan.rows),cols:String(plan.cols)})}</p>}
    <table className="w-full border-collapse text-left" data-testid="sheets-import-preview" aria-label={t('sheets.import.preview')}>
     <tbody>{importPreview(plan,PREVIEW_ROWS,PREVIEW_COLS).map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j} className="max-w-40 truncate border border-subtle px-1.5 py-0.5 text-ink-2">{cell}</td>)}</tr>)}</tbody>
    </table>
   </>}
   {error&&<p role="alert" className="text-red-600">{error}</p>}
  </div>
  <div className="flex justify-end gap-2">
   <Button variant="outline" size="compact" disabled={state.working} onClick={close}>{t('sheets.import.cancel')}</Button>
   <Button variant="outline" size="compact" disabled={!plan||state.working} onClick={()=>void run()} data-testid="sheets-import-run">{t('sheets.import.run')}</Button>
  </div>
 </DialogContent></Dialog>;
}
