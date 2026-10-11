import {useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import {StudioScheduleButton} from './StudioScheduleButton';
import {Plus} from '../../lib/icons';
import {VibeSpaceController} from '../../lib/vibespace/controller';
import {studioState} from '../../lib/vibespace/state';
import type {VibeIntent,VibeSpaceTransport} from '../../lib/vibespace/types';
import {CreateSpaceForm,CreateStudioForm,studioTemplates} from './CreateForms';
import {stateLabels,StudioDetail,StudioMetrics} from './StudioDetail';
import {t} from '../../lib/i18n';
import {nativeScheduleTransport,readScheduleCursor,storeScheduleCursor,type ReturnCard} from '../../lib/vibespace/schedule';
/** Mount with a stable transport. There is no global fallback and no app-store mutation. */
export function VibeSpaceHome({transport}:{transport:VibeSpaceTransport}){
 const controller=useMemo(()=>new VibeSpaceController(transport),[transport]);
 const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
 const [spaceId,setSpaceId]=useState(''),[studioId,setStudioId]=useState<string|null>(null),[form,setForm]=useState<'space'|'studio'|null>(null),[template,setTemplate]=useState('');
 useEffect(()=>{void controller.connect();return()=>controller.disconnect();},[controller]);
 const [returnCard,setReturnCard]=useState<ReturnCard|null>(null);
 useEffect(()=>{
  if(transport.mode!=='native'||!nativeScheduleTransport.returnCard)return;
  let alive=true;
  nativeScheduleTransport.returnCard(readScheduleCursor()).then(card=>{if(alive)setReturnCard(card);}).catch(()=>{});
  return()=>{alive=false;};
 },[transport]);
 const snapshot=state.snapshot;const space=snapshot?.spaces.find(s=>s.spaceId===spaceId)??snapshot?.spaces[0];
 const studio=snapshot?.studios.find(s=>s.runId===studioId&&s.spaceId===space?.spaceId);
 const busy=state.pending||state.loading||!!state.error;
 const supports=(type:VibeIntent['type'])=>transport.capabilities.includes(type);
 const newStudio=(goal='')=>{setTemplate(goal);setForm('studio');};
 return <section className="vs-root" aria-label="Vibe Space" aria-busy={state.loading||state.pending}>
  <header className="vs-header"><div className="vs-brand"><BotIcon/><h1>Vibe Space</h1></div><div className="vs-actions"><button type="button" disabled={busy||!supports('create-space')} onClick={()=>setForm('space')}><Plus size={15}/>New space</button>{space&&<button type="button" className="vs-primary" disabled={busy||!supports('create-studio')} onClick={()=>newStudio()}><Plus size={15}/>New Studio</button>}</div></header>
  {transport.mode==='fixture'&&<p className="vs-fixture" role="status">Fixture mode · Test data only. No native actions or project writes.</p>}
  {returnCard&&(returnCard.needsYou.length>0||returnCard.failed.length>0||returnCard.misfires.length>0)&&<div className="vs-card vs-error" role="status" data-testid="schedule-return-card"><strong>{t('vs.schedule.returnTitle')}</strong><p>{returnCard.needsYou.length} {t('vs.schedule.returnNeedsYou')} · {returnCard.failed.length} {t('vs.schedule.returnFailed')} · {returnCard.misfires.length} {t('vs.schedule.misfire')}</p><button type="button" onClick={()=>{storeScheduleCursor(returnCard.lastSeq);setReturnCard(null);}}>{t('vs.schedule.returnDismiss')}</button></div>}
  {state.error&&<div className="vs-error vs-card" role="alert"><strong>Vibe Space needs attention</strong><p data-copyable>{state.error}</p><p>Actions are disabled until the native state is loaded again. No fallback data is used.</p><button type="button" disabled={state.pending} onClick={()=>void controller.connect()}>Reload native state</button></div>}
  {state.loading&&<p className="vs-muted" role="status">Loading Vibe Space...</p>}
  {snapshot&&<div className="vs-body">
   {space&&<nav className="vs-spaces" aria-label="Vibe Spaces">{snapshot.spaces.map(s=><button type="button" key={s.spaceId} aria-current={s.spaceId===space.spaceId?'page':undefined} onClick={()=>{setSpaceId(s.spaceId);setStudioId(null);setForm(null);}}>{s.name}</button>)}</nav>}
   {form==='space'?<CreateSpaceForm busy={busy} onCreate={intent=>controller.execute(intent)} onChoose={()=>controller.chooseFolder()} onClose={()=>setForm(null)}/>:
    form==='studio'&&space?<CreateStudioForm key={`${space.spaceId}:${template}`} space={space} models={snapshot.models} busy={busy} template={template} onCreate={intent=>controller.execute(intent)} onClose={()=>setForm(null)}/>:
    studio?<StudioDetail transport={transport} key={studio.runId} studio={studio} space={space!} pending={busy} capabilities={transport.capabilities} onAction={intent=>controller.execute(intent)} onBack={()=>setStudioId(null)}/>:
    !space?<div className="vs-empty"><BotIcon/><h2>A place for focused AI work</h2><p>Create a Vibe Space, choose a folder, then give a Studio a goal. Work stays isolated. You decide what lands.</p><button type="button" className="vs-primary" disabled={busy||!supports('create-space')} onClick={()=>setForm('space')}>Create Vibe Space</button></div>:
    <><div className="vs-space-head"><h2>{space.name}</h2><p className="vs-muted"><code data-copyable>{space.scopeLabel}</code> · Ask for writes</p></div>
     {!snapshot.sessions.some(s=>s.spaceId===space.spaceId)?<div className="vs-empty"><h2>What should your first Studio do?</h2><p>Choose a starting point, then review the goal and model before creating it.</p><div className="vs-templates">{studioTemplates.map(t=><button type="button" key={t.title} disabled={busy||!supports('create-studio')} onClick={()=>newStudio(t.goal)}><strong>{t.title}</strong><span>{t.goal}</span></button>)}</div></div>:
     <div className="vs-board">{snapshot.sessions.filter(s=>s.spaceId===space.spaceId&&s.latestRunId===null).map(session=><section className="vs-card" key={session.studioId}><p className="vs-eyebrow">Draft Studio</p><h3>{session.goal.split('\n')[0].slice(0,100)}</h3><p>{session.model.provider} / {session.model.model}</p><p className="vs-muted">No run yet. Starting creates an isolated copy and checkpoint before work begins.</p><button type="button" className="vs-primary" disabled={busy||!session.canStart||!supports('start')} onClick={()=>void controller.execute({type:'start',studioId:session.studioId})}>Start Studio</button>{transport.mode==='native'&&<StudioScheduleButton studioId={session.studioId} disabled={busy}/>}</section>)}{(['needs-you','ready','running','draft','paused','done','stopped','applied','discarded','failed','crashed'] as const).map(group=>{const studios=snapshot.studios.filter(s=>s.spaceId===space.spaceId&&studioState(s)===group);return studios.length>0&&<section className="vs-group" key={group} aria-label={stateLabels[group]}><h3>{stateLabels[group]} <span>{studios.length}</span></h3>{studios.map(s=><button className="vs-studio-card" type="button" key={s.runId} onClick={()=>setStudioId(s.runId)}><strong>{s.goal.split('\n')[0].slice(0,100)}</strong><StudioMetrics studio={s}/><span className="vs-last-step">{s.failure?.message||s.pendingConsents[0]?.reason||s.lastStep||'No step recorded yet.'}</span></button>)}</section>;})}</div>}
    </>}
  </div>}
  {studio&&transport.mode==='native'&&<StudioScheduleButton studioId={studio.studioId} disabled={busy}/>}
  {state.pending&&<p className="vs-pending" role="status">Waiting for native confirmation...</p>}
 </section>;
}
/** Existing Vadivam icon convention, exact bot identity required by the product brief. */
function BotIcon(){return <svg data-icon="vadivam:bot" aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"><path d="M12 6.064h6c2.21 0 4 2.095 4 4.679v6.579C22 19.905 20.21 22 18 22H6c-2.21 0-4-2.095-4-4.678v-6.58C2 8.16 3.79 6.065 6 6.065zm0 0V2.4m3.333-.4a14.1 14.1 0 0 1-6.666 0M8 12v-1.5m8 1.5v-1.5"/><path d="M15.75 16.5A6.27 6.27 0 0 1 12 17.75a6.27 6.27 0 0 1-3.75-1.25"/></g></svg>;}
