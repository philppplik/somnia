import {useT} from '../lib/useT';
import {useRef,useState} from 'react';
import {useAppStore,patchState} from '../store/appStore';
import {Button} from './ui/button';
import * as ls from '../lib/libraryShare';
import type {Component} from '../lib/componentSystem';
import {loadLibrary} from '../lib/componentActions';
import {exportToFile,readImportFile,readProject,saveToProject,mergeIntoLibrary} from '../lib/libraryShareActions';
const LABEL:Record<ls.Resolution,string>={'keep-both':'panels.share.keepBoth','merge-variants':'panels.share.merge',replace:'panels.share.replace',skip:'panels.share.skip'};
/** Share and move component libraries: JSON file import/export and a library file inside the project. */
export function LibrarySharePanel({onChange}:{onChange:(l:Component[])=>void}){
 const {t}=useT();
 const s=useAppStore();const file=useRef<HTMLInputElement>(null);
 const [review,setReview]=useState<{source:string;parsed:ls.ParsedImport;items:ls.MergeItem[];choice:Record<string,ls.Resolution>}|null>(null);
 const run=(fn:()=>void)=>{try{fn();}catch(e){patchState({notice:t('panels.share.failed',{error:e instanceof Error?e.message:String(e)})});}};
 const begin=(source:string,parsed:ls.ParsedImport)=>{if(!parsed.components.length){patchState({notice:t('panels.share.noComponents',{source,warning:parsed.warnings.length?' '+parsed.warnings[0]:''})});return;}
  const items=ls.planMerge(loadLibrary(),parsed.components);const choice:Record<string,ls.Resolution>={};items.forEach(i=>{if(i.status==='conflict')choice[i.incoming.id]='keep-both';});
  if(!items.some(i=>i.status==='conflict')){finish(parsed,choice,source);return;}setReview({source,parsed,items,choice});};
 const finish=(parsed:ls.ParsedImport,choice:Record<string,ls.Resolution>,source:string)=>run(()=>{const {list,report}=mergeIntoLibrary(parsed.components,i=>choice[i.incoming.id]??'keep-both');onChange(list);setReview(null);
  const w=parsed.warnings.length?t('panels.share.skipped',{count:parsed.warnings.length}):'';patchState({notice:t('panels.share.report',{report:ls.describeReport(report),source,warnings:w})});});
 const projectLib=(()=>{try{return readProject();}catch{return undefined;}})();
 return <section aria-label={t('panels.share.shareComponentLibrary')} className="element-library"><h4>{t('panels.share.shareLibrary')}</h4>
  <p>{t('panels.share.exportYourComponentsToA')}</p>
  <input ref={file} type="file" accept="application/json,.json" hidden aria-label={t('panels.share.componentLibraryFile')} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)readImportFile(f).then(p=>begin(f.name,p),err=>patchState({notice:t('panels.share.importFailed',{error:err instanceof Error?err.message:String(err)})}));}}/>
  <Button variant="outline" onClick={()=>run(()=>{exportToFile();patchState({notice:t('panels.share.libraryDownloadRequested')});})}>{t('panels.share.exportLibraryJSON')}</Button>
  <Button variant="outline" onClick={()=>file.current?.click()}>{t('panels.share.importLibraryJSON')}</Button>
  <Button variant="outline" disabled={!s.coreConnected} onClick={()=>run(()=>{saveToProject();patchState({notice:t('panels.share.saved',{path:ls.PROJECT_LIBRARY_PATH})});})}>{t('panels.share.saveLibraryToProject')}</Button>
  <Button variant="outline" disabled={!s.coreConnected||projectLib===null} onClick={()=>run(()=>{const p=readProject();if(!p)throw new Error(t('panels.share.noFile',{path:ls.PROJECT_LIBRARY_PATH}));begin(ls.PROJECT_LIBRARY_PATH,p);})}>{t('panels.share.loadLibraryFromProject')}</Button>
  {projectLib===undefined&&<p role="alert">{t('panels.share.damaged',{path:ls.PROJECT_LIBRARY_PATH})}</p>}
  {review&&<div role="group" aria-label={t('panels.share.resolveImportConflicts')}><h4>{t('panels.share.conflicts',{count:review.items.filter(i=>i.status==='conflict').length,source:review.source})}</h4>
   <p>{t('panels.share.theseComponentsAlreadyExistIn')}</p>
   {review.items.filter(i=>i.status==='conflict').map(i=><label key={i.incoming.id} className="flex items-center gap-2">{i.incoming.name} {t('panels.share.variants',{incoming:i.incoming.variants.length,existing:i.match!.variants.length})}
    <select aria-label={t('panels.share.resolution',{name:i.incoming.name})} value={review.choice[i.incoming.id]} onChange={e=>setReview({...review,choice:{...review.choice,[i.incoming.id]:e.target.value as ls.Resolution}})}>{(Object.keys(LABEL) as ls.Resolution[]).map(r=><option key={r} value={r}>{t(LABEL[r])}</option>)}</select></label>)}
   <Button variant="outline" onClick={()=>finish(review.parsed,review.choice,review.source)}>{t('panels.share.applyImport')}</Button><Button onClick={()=>setReview(null)}>{t('panels.share.cancel')}</Button></div>}
 </section>;
}
