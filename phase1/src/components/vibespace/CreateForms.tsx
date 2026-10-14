import {LocalReadinessCard} from './LocalReadinessCard';
import {ModelHealthPanel} from './ModelHealthPanel';
import {useState} from 'react';
import type {FolderGrant,ModelRef,Space,VibeIntent} from '../../lib/vibespace/types';
import {NativeButton,NativeInput,NativeSelect,Textarea} from '../ui/native-controls';
export const studioTemplates=[
 {title:'Polish a page',goal:'Review the page for clarity and accessibility. Propose focused improvements.'},
 {title:'Improve a document',goal:'Improve the document structure and wording without changing its meaning.'},
 {title:'Check a project',goal:'Inspect the project, explain problems, and propose fixes with checks.'},
];
/** Stable identity: a reordered or refreshed model list can never substitute another model. */
const modelId=(m:ModelRef)=>JSON.stringify([m.provider,m.model,m.locality]);
export function CreateSpaceForm({busy,onCreate,onChoose,onClose}:{busy:boolean;onCreate:(intent:VibeIntent)=>Promise<boolean>;onChoose:()=>Promise<FolderGrant|null>;onClose:()=>void}){
 const [name,setName]=useState(''),[grant,setGrant]=useState<FolderGrant|null>(null),[choosing,setChoosing]=useState(false);
 return <form className="vs-form vs-card" aria-label="Create Vibe Space" onSubmit={e=>{e.preventDefault();if(!grant||!name.trim()||busy)return;const used=grant;setGrant(null);void onCreate({type:'create-space',name:name.trim(),folderGrantId:used.folderGrantId}).then(ok=>{if(ok)onClose();});}}>
  <h3>Create Vibe Space</h3><label>Name<NativeInput maxLength={120} required value={name} onChange={e=>setName(e.target.value)} disabled={busy}/></label>
  <label>Folder scope<output data-copyable>{grant?.folder??'No folder chosen'}</output></label>
  <NativeButton type="button" disabled={busy||choosing} onClick={()=>{setChoosing(true);void onChoose().then(g=>{if(g)setGrant(g);}).finally(()=>setChoosing(false));}}>{choosing?'Choosing folder...':'Choose folder'}</NativeButton>
  <p className="vs-muted">Only the folder you choose is in scope. Ask for writes is on. Work stays isolated until you apply it.</p>
  <div className="vs-actions"><NativeButton className="vs-primary" disabled={busy||choosing||!grant||!name.trim()}>Create Vibe Space</NativeButton><NativeButton type="button" disabled={busy} onClick={onClose}>Cancel</NativeButton></div>
 </form>;
}
export function CreateStudioForm({space,models,busy,template='',onCreate,onClose}:{space:Space;models:ModelRef[];busy:boolean;template?:string;onCreate:(intent:VibeIntent)=>Promise<boolean>;onClose:()=>void}){
 const [goal,setGoal]=useState(template),[modelKey,setModelKey]=useState('');
 const model=models.find(m=>modelId(m)===modelKey);const valid=!!model&&!!goal.trim();
 return <form className="vs-form vs-card" aria-label="Create Studio" onSubmit={e=>{e.preventDefault();if(!valid||busy)return;void onCreate({type:'create-studio',spaceId:space.spaceId,goal:goal.trim(),model}).then(ok=>{if(ok)onClose();});}}>
  <h3>New Studio</h3><LocalReadinessCard/><label>Goal<Textarea required rows={4} maxLength={8192} value={goal} disabled={busy} onChange={e=>setGoal(e.target.value)}/></label>
  <label>Model<NativeSelect required value={model?modelKey:''} disabled={busy||!models.length} onChange={e=>setModelKey(e.target.value)}><option value="">Choose a configured model</option>{models.map(m=><option key={modelId(m)} value={modelId(m)}>{m.provider} / {m.model} ({m.locality})</option>)}</NativeSelect></label>
  {!models.length&&<p role="status">No configured model. Add a model in AI settings first.</p>}
  {model?.locality==='local'&&<ModelHealthPanel model={model}/>}
  {model?.locality==='cloud'&&<p className="vs-notice">This cloud model receives the selected folder's task context. The native consent broker checks cloud and tool permissions before work begins.</p>}
  <label>Folder scope<output data-copyable>{space.scopeLabel}</output></label><p className="vs-muted">Ask for writes. No real project changes until review and Apply.</p>
  <div className="vs-actions"><NativeButton className="vs-primary" disabled={busy||!valid}>Create Studio</NativeButton><NativeButton type="button" disabled={busy} onClick={onClose}>Cancel</NativeButton></div>
 </form>;
}
