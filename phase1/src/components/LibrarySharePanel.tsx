import {useRef,useState} from 'react';
import {useAppStore,patchState} from '../store/appStore';
import {Button} from './ui/button';
import * as ls from '../lib/libraryShare';
import type {Component} from '../lib/componentSystem';
import {loadLibrary} from '../lib/componentActions';
import {exportToFile,readImportFile,readProject,saveToProject,mergeIntoLibrary} from '../lib/libraryShareActions';
const LABEL:Record<ls.Resolution,string>={'keep-both':'Keep both (rename the new one)','merge-variants':'Merge variants into mine',replace:'Replace mine','skip':'Skip'};
/** Share and move component libraries: JSON file import/export and a library file inside the project. */
export function LibrarySharePanel({onChange}:{onChange:(l:Component[])=>void}){
 const s=useAppStore();const file=useRef<HTMLInputElement>(null);
 const [review,setReview]=useState<{source:string;parsed:ls.ParsedImport;items:ls.MergeItem[];choice:Record<string,ls.Resolution>}|null>(null);
 const run=(fn:()=>void)=>{try{fn();}catch(e){patchState({notice:`Library action failed: ${e instanceof Error?e.message:String(e)} Nothing was changed.`});}};
 const begin=(source:string,parsed:ls.ParsedImport)=>{if(!parsed.components.length){patchState({notice:`No usable components in ${source}.${parsed.warnings.length?' '+parsed.warnings[0]:''}`});return;}
  const items=ls.planMerge(loadLibrary(),parsed.components);const choice:Record<string,ls.Resolution>={};items.forEach(i=>{if(i.status==='conflict')choice[i.incoming.id]='keep-both';});
  if(!items.some(i=>i.status==='conflict')){finish(parsed,choice,source);return;}setReview({source,parsed,items,choice});};
 const finish=(parsed:ls.ParsedImport,choice:Record<string,ls.Resolution>,source:string)=>run(()=>{const {list,report}=mergeIntoLibrary(parsed.components,i=>choice[i.incoming.id]??'keep-both');onChange(list);setReview(null);
  const w=parsed.warnings.length?` ${parsed.warnings.length} entries in the file were skipped.`:'';patchState({notice:`${ls.describeReport(report)} Source: ${source}.${w}`});});
 const projectLib=(()=>{try{return readProject();}catch{return undefined;}})();
 return <section aria-label="Share component library" className="element-library"><h4>Share library</h4>
  <p>Export your components to a JSON file, import someone else's, or keep the library in the project so it travels with the folder.</p>
  <input ref={file} type="file" accept="application/json,.json" hidden aria-label="Component library file" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)readImportFile(f).then(p=>begin(f.name,p),err=>patchState({notice:`Import failed: ${err instanceof Error?err.message:String(err)} Nothing was changed.`}));}}/>
  <Button variant="outline" onClick={()=>run(()=>{exportToFile();patchState({notice:'Library download requested.'});})}>Export library (JSON)</Button>
  <Button variant="outline" onClick={()=>file.current?.click()}>Import library (JSON)</Button>
  <Button variant="outline" disabled={!s.coreConnected} onClick={()=>run(()=>{saveToProject();patchState({notice:`Library saved to ${ls.PROJECT_LIBRARY_PATH}. Save the project to write it to disk.`});})}>Save library to project</Button>
  <Button variant="outline" disabled={!s.coreConnected||projectLib===null} onClick={()=>run(()=>{const p=readProject();if(!p)throw new Error(`This project has no ${ls.PROJECT_LIBRARY_PATH}.`);begin(ls.PROJECT_LIBRARY_PATH,p);})}>Load library from project</Button>
  {projectLib===undefined&&<p role="alert">The project file {ls.PROJECT_LIBRARY_PATH} is damaged and cannot be read. Fix or delete it in Files.</p>}
  {review&&<div role="group" aria-label="Resolve import conflicts"><h4>{review.items.filter(i=>i.status==='conflict').length} name conflict(s) from {review.source}</h4>
   <p>These components already exist in your library. Choose what to do with each. Nothing is changed until you apply.</p>
   {review.items.filter(i=>i.status==='conflict').map(i=><label key={i.incoming.id} className="flex items-center gap-2">{i.incoming.name} ({i.incoming.variants.length} variants, yours has {i.match!.variants.length})
    <select aria-label={`Resolution for ${i.incoming.name}`} value={review.choice[i.incoming.id]} onChange={e=>setReview({...review,choice:{...review.choice,[i.incoming.id]:e.target.value as ls.Resolution}})}>{(Object.keys(LABEL) as ls.Resolution[]).map(r=><option key={r} value={r}>{LABEL[r]}</option>)}</select></label>)}
   <Button variant="outline" onClick={()=>finish(review.parsed,review.choice,review.source)}>Apply import</Button><Button onClick={()=>setReview(null)}>Cancel</Button></div>}
 </section>;
}
