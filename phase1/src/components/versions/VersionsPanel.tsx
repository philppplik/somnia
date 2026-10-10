import {useState,useSyncExternalStore,type ReactNode} from 'react';
import type {GitBackend} from '../../lib/git/types';
import {useT} from '../../lib/useT';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '../ui/tabs';
import {ChangesTab} from './ChangesTab';
import {getAdvanced,setAdvanced,subscribeAdvanced} from './vocab';
import {getGitBackend} from './backend';

/**
 * Left-sidebar "Versions" panel. Changes tab is this package; History is a slot for package C.
 * Rendered only through its props: backend, unsaved-file count and the save action come from the app.
 */
export function VersionsPanel({backend,unsavedFiles,onSaveFiles,historySlot,compareSlot,variantsSlot,publicationSlot,explainSlot}:{backend?:GitBackend|null;unsavedFiles:number;onSaveFiles:()=>Promise<void>|void;historySlot?:ReactNode;compareSlot?:ReactNode;variantsSlot?:(goChanges:()=>void)=>ReactNode;publicationSlot?:ReactNode;explainSlot?:ReactNode}){
 const {t}=useT();const adv=useSyncExternalStore(subscribeAdvanced,getAdvanced,getAdvanced);
 const b=backend??getGitBackend();const [tab,setTab]=useState('changes');const [rev,setRev]=useState(0);
 return <section className="flex h-full min-h-0 flex-col" aria-label={t('versions.title')} data-testid="versions-panel">
  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pt-3"><h2 className="m-0 flex-1 text-xs font-semibold text-ink">{t('versions.title')}</h2>
   <label className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-ink-2" title={t('versions.advanced.hint')}><input type="checkbox" role="switch" checked={adv} onChange={e=>setAdvanced(e.target.checked)} data-testid="versions-advanced"/>{t('versions.advanced')}</label></div>
  {!b?<p className="p-4 text-xs text-ink-3" role="status" data-testid="versions-nobackend">{t('versions.noBackend')}</p>:
  <> <div className="grid grid-cols-2 gap-1 px-3 py-2 text-[10px] text-ink-2" aria-label={t('publication.states')}>{['saved','versioned','published','inReview'].map(k=><span key={k} title={t(`publication.state.${k}.hint`)} className="rounded-sm border border-subtle px-2 py-1">{t(`publication.state.${k}`)}</span>)}</div>
  <Tabs value={tab} onValueChange={v=>setTab(String(v))} className="min-h-0 flex-1">
   <TabsList aria-label={t('versions.title')} className="w-full overflow-x-auto [&_button]:px-2 [&_button]:text-[11px]"><TabsTrigger value="changes">{t('versions.tab.changes')}</TabsTrigger><TabsTrigger value="history">{t('versions.tab.history')}</TabsTrigger>{variantsSlot&&<TabsTrigger value="variants">{t('versions.tab.variants')}</TabsTrigger>}{explainSlot&&<TabsTrigger value="explain">{t('versions.tab.explain')}</TabsTrigger>}{publicationSlot&&<TabsTrigger value="publish">{t('publication.publish')}</TabsTrigger>}{compareSlot&&<TabsTrigger value="compare">{t('versions.tab.compare')}</TabsTrigger>}</TabsList>
   <TabsContent value="changes"><ChangesTab backend={b} unsavedFiles={unsavedFiles} onSaveFiles={onSaveFiles} advanced={adv} onVersionSaved={()=>setRev(r=>r+1)}/></TabsContent>
   <TabsContent value="history" key={rev}>{historySlot??<p className="p-4 text-xs text-ink-3">{t('versions.history.soon')}</p>}</TabsContent>
  {variantsSlot&&<TabsContent value="variants">{variantsSlot(()=>setTab('changes'))}</TabsContent>}{explainSlot&&<TabsContent value="explain">{explainSlot}</TabsContent>}{compareSlot&&<TabsContent value="compare">{compareSlot}</TabsContent>}
  {publicationSlot&&<TabsContent value="publish">{publicationSlot}</TabsContent>}
  </Tabs></>}
 </section>;}
