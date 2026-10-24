import {useRef,useState} from 'react';
import {replaceVectorFromFile} from '../../lib/vectorstudio/panelImport';
import {SvgImportError} from '../../lib/vectorio';
import {getVectorSession,useVectorSession} from '../../lib/vectorstudio/session';
import {useT} from '../../lib/useT';
import {reportError} from '../../lib/log';
import {Button} from '../ui/button';

import {NativeInput} from '../ui/native-controls';
/** Replaces artwork as one undoable edit, unlike opening a new Vector session. */
export function VectorImportControls(){
 const {t}=useT(),s=useVectorSession(),file=useRef<HTMLInputElement>(null),importing=useRef(false);
 const [busy,setBusy]=useState(false),[note,setNote]=useState('');
 const open=async(selected:File|undefined)=>{
  if(!selected||!getVectorSession().open||importing.current)return;
  importing.current=true;setBusy(true);setNote('');
  try{
   const warnings=await replaceVectorFromFile(selected);
   setNote(warnings.map(w=>w.message).join(' '));
  }catch(error){
   reportError('vector.operation',error,{context:{studio:'vector'}});
   setNote(error instanceof SvgImportError?[error.message,...error.diagnostics.map(d=>d.message)].join(' '):error instanceof Error?error.message:t('vector.shell.importFailed'));
  }finally{importing.current=false;setBusy(false);}
 };
 return <div className="col-span-2 grid gap-2 text-xs">
  <NativeInput ref={file} type="file" accept=".svg,image/svg+xml" hidden disabled={!s.open||busy} aria-label={t('vector.openSvg')} data-testid="vector-svg-file" onChange={e=>{const selected=e.currentTarget.files?.[0];e.currentTarget.value='';void open(selected);}}/>
  <Button size="compact" variant="outline" disabled={!s.open||busy} title={t('vector.shell.replaceHint')} data-testid="vector-import-svg" onClick={()=>file.current?.click()}>{t('vector.openSvg')}</Button>
  {note&&<p role="status" className="m-0 break-words text-ink-3" data-testid="vector-io-status">{note}</p>}
 </div>;
}
