import {useState,useSyncExternalStore} from 'react';
import {FilePlus2} from 'lucide-react';
import {ConfirmShell} from './ConfirmShell';
import {Button} from './ui/button';
import {newProjectFlow} from '../lib/frameworks/newProjectFlow';
import {validateProjectName} from '../lib/frameworks/scaffold';
import {useT} from '../lib/useT';
import {ALL_TEMPLATE_FRAMEWORKS,FRAMEWORK_LABELS,SERVER_FRAMEWORK_LABELS,isServerFramework,type FrameworkLanguage,type AnyTemplateFramework} from '../lib/frameworks/templateManifest';
const HINT_KEYS:Record<AnyTemplateFramework,string>={react:'frameworks.hintReact',vue:'frameworks.hintVue',svelte:'frameworks.hintSvelte',solid:'frameworks.hintSolid',next:'frameworks.hintNext',astro:'frameworks.hintAstro',sveltekit:'frameworks.hintSvelteKit',nuxt:'frameworks.hintNuxt'};
const labelOf=(f:AnyTemplateFramework)=>isServerFramework(f)?SERVER_FRAMEWORK_LABELS[f]:FRAMEWORK_LABELS[f];
/** Framework chips with one plain-language hint for the selected framework. */
export function FrameworkChoice({framework,onChange,disabled}:{framework:AnyTemplateFramework;onChange:(value:AnyTemplateFramework)=>void;disabled?:boolean}){
 const {t}=useT();
 return <fieldset disabled={disabled} className="border-0 p-0" data-testid="framework-choice"><legend className="mb-2 text-[12px] text-ink-2">{t('frameworks.framework')}</legend><div className="flex flex-wrap gap-2">{ALL_TEMPLATE_FRAMEWORKS.map(value=><button type="button" key={value} data-framework={value} aria-pressed={framework===value} onClick={()=>onChange(value)} className={`rounded-full border px-3 py-1 text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 ${framework===value?'border-accent bg-accent-soft':'border-line bg-panel hover:bg-hover'}`}>{labelOf(value)}</button>)}</div><p className="mb-0 mt-2 text-[11px] text-ink-2" data-testid="framework-hint">{t(HINT_KEYS[framework])}{isServerFramework(framework)?<> <span data-testid="framework-needs-server">{t('frameworks.needsServer')}</span></>:null}</p></fieldset>;
}
export function NewProjectDialog(){
 const {t}=useT();const flow=useSyncExternalStore(newProjectFlow.subscribe,newProjectFlow.getSnapshot,newProjectFlow.getSnapshot);const [name,setName]=useState('my-app');const [language,setLanguage]=useState<FrameworkLanguage>('ts');const [framework,setFramework]=useState<AnyTemplateFramework>('react');
 let valid=true;try{validateProjectName(name);}catch{valid=false;}
 return <ConfirmShell open={flow.open} onCancel={newProjectFlow.cancel} busy={flow.busy} tone="accent" Icon={FilePlus2} ariaLabel={t('frameworks.newProject')} title={t('frameworks.newProject')} description={t('frameworks.chooseKind')}
 body={<div className="flex flex-col gap-4" data-testid="framework-gallery">
  <button type="button" aria-pressed="true" className="rounded-[18px] border border-accent bg-accent-soft p-4 text-left text-ink" disabled={flow.busy}><strong className="block text-[14px]">{t('frameworks.interactiveApp')}</strong><span className="mt-1 block text-[12px] text-ink-2">{t('frameworks.interactiveHintAny')}</span></button>
  <FrameworkChoice framework={framework} onChange={setFramework} disabled={flow.busy}/>
  <fieldset disabled={flow.busy} className="border-0 p-0"><legend className="mb-2 text-[12px] text-ink-2">{t('frameworks.language')}</legend><div className="flex gap-3">{(['ts','js'] as const).map(value=><label className="flex items-center gap-1.5 text-[12px]" key={value}><input type="radio" name="framework-language" value={value} checked={language===value} onChange={()=>setLanguage(value)}/>{value==='ts'?'TypeScript':'JavaScript'}</label>)}</div></fieldset>
  <label className="flex flex-col gap-1.5 text-[12px]">{t('frameworks.name')}<input autoFocus className="rounded-[10px] border border-line bg-panel px-3 py-2 text-ink" value={name} maxLength={64} disabled={flow.busy} onChange={event=>setName(event.target.value)} aria-invalid={!valid} aria-describedby="framework-name-hint"/></label>
  <p id="framework-name-hint" className="m-0 text-[11px] text-ink-3">{t(valid?'frameworks.folderHint':'frameworks.invalidName')}</p>
  <p className="m-0 text-[11px] text-ink-2">{t('frameworks.codeOnly')}</p>
  {flow.errorKey&&<p role="alert" className="dlg-error">{t(flow.errorKey)}</p>}
 </div>}
 footer={<><span className="dlg-spacer"/><Button onClick={newProjectFlow.cancel} disabled={flow.busy}>{t('dialogs.cancel')}</Button><Button variant="primary" disabled={flow.busy||!valid} onClick={()=>void newProjectFlow.create({name,language,framework})}>{t(flow.busy?'frameworks.creating':'frameworks.create')}</Button></>}/>;
}
