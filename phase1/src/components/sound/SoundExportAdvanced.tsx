import {useEffect,useMemo,useState} from 'react';
import {setSoundExportAdvanced,useSoundExportAdvanced} from '../../lib/sound/exportAdvancedState';
import {activeSoundName} from '../../lib/sound/commands';
import {exportSound,isSoundExportReady,saveSoundBlob,useSoundSession} from '../../lib/sound/session';
import {isNeutralSoundExport,renderSoundExport,soundExportFileName,soundExportSchema,soundOptionsToValues,valuesToSoundOptions,SOUND_EXPORT_DEFAULTS} from '../../lib/sound/exportWav';
import {useT} from '../../lib/useT';
import type {ExportValues,ExportValue} from '../../lib/export/schema';
import {AdvancedExportDialog,type ExportPreview} from '../export/AdvancedExportDialog';
/** Studio-owned host: opens the shared Advanced Export dialog for Sound (AE2) - bit depth, channels, peak normalisation and WAV tags on the rendered clip. */
export function SoundExportAdvanced(){
 const {t}=useT();const name=useSoundExportAdvanced();const s=useSoundSession(name);
 const schema=useMemo(()=>soundExportSchema(),[]);
 const base=()=>(name??'audio').replace(/^.*[\\/]/,'').replace(/\.[^.]+$/,'');
 const [values,setValues]=useState<ExportValues>(()=>({...soundOptionsToValues(SOUND_EXPORT_DEFAULTS)}));
 const [preview,setPreview]=useState<ExportPreview|null>(null);const [working,setWorking]=useState(false);
 const [errorKey,setErrorKey]=useState<string|null>(null);const [errorDetail,setErrorDetail]=useState('');
 useEffect(()=>{if(name)setValues(v=>({...v,name:v.name||base()}));},[name]);
 useEffect(()=>()=>setSoundExportAdvanced(null),[]);
 // The clip changed under the dialog (other file active, edit still rendering): close instead of exporting something else.
 const ready=!!name&&isSoundExportReady(name)&&activeSoundName()===name;
 useEffect(()=>{if(name&&!ready&&!working)setSoundExportAdvanced(null);},[name,ready,working,s?.processed]);
 const change=(id:string,value:ExportValue)=>setValues(v=>({...v,[id]:value}));
 const apply=(preset:ExportValues)=>setValues(v=>({...v,...preset,name:v.name}));
 const build=async()=>{
  const out=name?exportSound(name):null;if(!out)throw Error('Nothing rendered yet.');
  const o=valuesToSoundOptions(values);
  const wav=isNeutralSoundExport(o)?await out.blob.arrayBuffer():renderSoundExport(await out.blob.arrayBuffer(),o).wav;
  return {blob:new Blob([wav],{type:'audio/wav'}),fileName:soundExportFileName(o.name),bytes:wav.byteLength};
 };
 const processed=s?.processed;
 useEffect(()=>{
  if(!name||!processed||schema.validate(values)!==null){setPreview(null);return;}
  let live=true;setErrorKey(null);
  void build().then(r=>{if(live)setPreview({url:null,bytes:r.bytes,width:0,height:0,note:null,detail:undefined});}).catch(err=>{if(live){setPreview(null);setErrorKey('export.error.render');setErrorDetail(err instanceof Error?err.message:String(err));}});
  return()=>{live=false;};
 },[values,name,processed,schema]);
 const report=processed?.report.output;
 const shown=preview&&report?{...preview,detail:t('export.soundDetail',{seconds:report.duration_s.toFixed(2),channels:valuesToSoundOptions(values).channels==='mono'?1:report.channels,rate:report.sample_rate})}:preview;
 const run=async()=>{
  if(working)return;setErrorKey(null);setWorking(true);
  try{const r=await build();const outcome=await saveSoundBlob(r.blob,r.fileName);if(outcome!=='cancelled')setSoundExportAdvanced(null);}
  catch(err){setErrorKey('export.error.render');setErrorDetail(err instanceof Error?err.message:String(err));}
  finally{setWorking(false);}
 };
 return <AdvancedExportDialog open={!!name} onClose={()=>setSoundExportAdvanced(null)} schema={schema} values={values} onChange={change} onApply={apply} preview={shown} rendering={false} busy={working} errorKey={errorKey} errorDetail={errorDetail} onExport={()=>void run()} contentTestId="sound-export-advanced"/>;
}
