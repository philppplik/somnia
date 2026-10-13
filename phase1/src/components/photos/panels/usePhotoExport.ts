import {useState} from 'react';
import {useT} from '../../../lib/useT';
import {commandDispatcher} from '../../../lib/commandDispatcher';
import {getPhotoExportState,setPhotoExportState,usePhotoExportState} from '../../../lib/photos/exportState';
/** One dispatcher/export path and busy gate for both the rail and header setup. */
export function usePhotoExport(){
 const {t}=useT(),state=usePhotoExportState();const [note,setNote]=useState('');
 const run=async(format:'png'|'jpeg')=>{
  if(getPhotoExportState().working)return;
  setNote('');
  try{const r=await commandDispatcher.runCommand<string>('photos.export',{format},{origin:'ui'});setNote(r==='saved'?t('photos.saved'):'');}
  catch(e){setNote(t('photos.saveFailed',{message:(e instanceof Error?e.message:String(e)).replace(/^Error:\s*/,'')}));}
 };
 return {...state,note,run,setFormat:(format:'png'|'jpeg')=>setPhotoExportState({format})};
}
