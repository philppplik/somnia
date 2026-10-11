import {useState} from 'react';
import {Check,RotateCcw,Send,Square,X} from '../../lib/icons';
import {canApply,costLabel,duration,studioControls,studioState} from '../../lib/vibespace/state';
import type {Studio,VibeIntent,Space} from '../../lib/vibespace/types';
export const stateLabels={draft:'Draft',running:'Running',paused:'Paused',done:'Done','needs-you':'Needs you',ready:'Ready for review',stopped:'Stopped',applied:'Applied',discarded:'Discarded',failed:'Failed',crashed:'Crashed'};
export function StudioMetrics({studio}:{studio:Studio}){
 const cost=costLabel(studio);
 return <div className="vs-metrics"><span className="vs-badge" data-state={studioState(studio)}>{stateLabels[studioState(studio)]}</span><span>{studio.model.provider} / {studio.model.model}</span><span>{duration(studio.elapsedMs)}</span>{cost&&<span title={studio.usage?.costSource??'Price source unavailable'}>{cost} ({studio.usage?.costSource??'Price source unavailable'})</span>}</div>;
}
export function ConsentCard({studio,disabled,runAllowed,onAction}:{studio:Studio;disabled:boolean;runAllowed:boolean;onAction:(intent:VibeIntent)=>Promise<boolean>}){
 if(!studio.pendingConsents.length)return null;
 return <>{studio.pendingConsents.map(consent=><ConsentRequestView key={consent.requestId} consent={consent} studio={studio} disabled={disabled} runAllowed={runAllowed} onAction={onAction}/>)}</>;
}
function ConsentRequestView({consent,studio,disabled,runAllowed,onAction}:{consent:Studio["pendingConsents"][number];studio:Studio;disabled:boolean;runAllowed:boolean;onAction:(intent:VibeIntent)=>Promise<boolean>}){
 return <section className="vs-card vs-consent" aria-label="Needs you consent"><h3>Needs you</h3><strong>{consent.action}</strong><dl><dt>Scope</dt><dd data-copyable>{consent.scope}</dd><dt>Why</dt><dd>{consent.reason}</dd></dl>
  <p className="vs-muted">Allow applies only to this exact request. It does not extend the folder scope.</p>
  <div className="vs-actions">{(['allow_once','allow_for_run','deny'] as const).map(choice=><button type="button" key={choice} disabled={disabled||(choice==='allow_for_run'&&(!consent.allowForRun||!runAllowed))} onClick={()=>void onAction({type:'consent',runId:studio.runId,requestId:consent.requestId,choice})}>{({allow_once:'Allow once',allow_for_run:'Allow for this run',deny:'Deny'})[choice]}</button>)}</div>
 </section>;
}
export function ReviewChanges({studio,disabled,onAction}:{studio:Studio;disabled:boolean;onAction:(intent:VibeIntent)=>Promise<boolean>}){
 const review=studio.review;
 const [selected,setSelected]=useState<string[]>(()=>review?.files.filter(h=>!review.conflicts.includes(h.path)).map(h=>h.path)??[]);
 const [confirm,setConfirm]=useState<'apply'|'discard'|null>(null);
 if(!review)return null;
 const applyAllowed=canApply(studio,selected,disabled);
 return <section className="vs-card" aria-label="Review changes"><h3>Review changes</h3><p>{review.summary}</p>
  <p className="vs-muted">{studio.reviewState==='applied'?'These changes were applied by the native core.':studio.reviewState==='discarded'?'This proposal was discarded. The project was not changed by this proposal.':'Isolated work. Your project has not changed.'}</p>
  {review.checks.length>0&&<details open><summary>Checks</summary><ul>{review.checks.map((check,i)=><li key={i}>{check.name}: {({passed:'Passed',failed:'Failed',not_run:'Not run'} as Record<string,string>)[check.status]??check.status}{check.detail&&` - ${check.detail}`}</li>)}</ul></details>}
  {!review.files.length&&<p role="status">No changes to apply.</p>}
  {review.files.map(h=><article className="vs-change" key={h.path}>
   <label className="vs-hunk-title"><input type="checkbox" aria-label={`Include ${h.path}`} disabled={disabled||review.conflicts.includes(h.path)} checked={selected.includes(h.path)&&!review.conflicts.includes(h.path)} onChange={e=>{setConfirm(null);setSelected(ids=>e.target.checked?[...ids,h.path]:ids.filter(id=>id!==h.path));}}/><code data-copyable>{h.path}</code>{review.conflicts.includes(h.path)&&<span className="vs-conflict">Conflict</span>}</label>
   {review.conflicts.includes(h.path)&&<p className="vs-notice" role="status">The project changed after this run started. This change cannot be applied. Resolve it with a new reviewed proposal.</p>}
   <div className="vs-diff"><div><h4>{review.conflicts.includes(h.path)?'Current project':'Before'}</h4><pre data-copyable>{h.binary?`Binary: ${h.conflict?h.currentBytes:h.beforeBytes} bytes`:h.conflict?h.currentText??'Current text unavailable':h.beforeText??'No text baseline'}</pre></div><div><h4>Proposed</h4><pre data-copyable>{h.binary?`Binary: ${h.afterBytes} bytes`:h.afterText??'No text content'}</pre></div></div>
   {h.conflict&&<details><summary>Original baseline</summary><pre data-copyable>{h.binary?`Binary: ${h.beforeBytes} bytes`:h.beforeText??'No text baseline'}</pre></details>}
  </article>)}
  {['applied','discarded'].includes(studio.reviewState)?<p role="status">{studio.reviewState==='applied'?'Applied':'Discarded'}</p>:confirm?<div className="vs-confirm" role="group" aria-label="Confirm review decision"><p>{confirm==='apply'?`Apply ${selected.length} selected change(s) to the real project? A checkpoint is taken first. Conflicts are checked again.`:'Discard this isolated proposal? Your project stays unchanged.'}</p><div className="vs-actions"><button className="vs-primary" type="button" disabled={disabled||(confirm==='apply'&&!applyAllowed)} onClick={()=>void onAction({type:'review',runId:studio.runId,reviewRevision:review.revision,decision:confirm,paths:confirm==='apply'?selected:[]}).then(ok=>{if(ok)setConfirm(null);})}>Confirm {confirm==='apply'?'Apply':'Discard'}</button><button type="button" disabled={disabled} onClick={()=>setConfirm(null)}>Cancel</button></div></div>:
  <div className="vs-actions"><button className="vs-primary" type="button" disabled={!applyAllowed} onClick={()=>setConfirm('apply')}><Check size={15}/>Apply selected</button><button type="button" disabled={disabled} onClick={()=>setConfirm('discard')}><X size={15}/>Discard</button></div>}
 </section>;
}
export function StudioDetail({studio,space,pending,capabilities,onAction,onBack}:{studio:Studio;space:Space;pending:boolean;capabilities:readonly VibeIntent['type'][];onAction:(intent:VibeIntent)=>Promise<boolean>;onBack:()=>void}){
 const [steer,setSteer]=useState(''),[restore,setRestore]=useState<string|null>(null);
 const controls=studioControls(studio,pending);const supports=(type:VibeIntent['type'])=>capabilities.includes(type);
 return <div className="vs-detail"><button type="button" className="vs-back" onClick={onBack}>Back to Vibe Space</button>
  <header className="vs-detail-head"><div><p className="vs-eyebrow">Studio</p><h2>{studio.goal.split('\n')[0].slice(0,100)}</h2></div><button type="button" disabled={!controls.stop||!supports('stop')} onClick={()=>void onAction({type:'stop',runId:studio.runId})}><Square size={14}/>Stop</button></header>
  <StudioMetrics studio={studio}/><p className="vs-goal" data-copyable>{studio.goal}</p><p className="vs-muted"><span>Scope: </span><code data-copyable>{space.scopeLabel}</code> · Ask for writes</p>
  <section className="vs-card"><h3>Last step</h3><p role="status">{studio.lastStep||'No step recorded yet.'}</p></section>
  {studio.failure&&<section className="vs-card vs-error" role="alert"><h3>{stateLabels[studioState(studio)]}</h3><p>{studio.failure.message}</p><details><summary>Error details</summary><code data-copyable>{studio.failure.code}</code></details><button type="button" disabled={!controls.retry||!supports('retry')} onClick={()=>void onAction({type:'retry',runId:studio.runId})}>Retry in a new run</button></section>}
  <ConsentCard studio={studio} disabled={!controls.consent||!supports('consent')} runAllowed={true} onAction={onAction}/>
  {studio.review&&<ReviewChanges key={`${studio.runId}:${studio.review.revision}`} studio={studio} disabled={!controls.review||!supports('review')} onAction={onAction}/>}
  {studio.messages.length>0&&<details className="vs-card"><summary>Run transcript</summary><ol className="vs-transcript">{studio.messages.map(m=><li key={m.id}><strong>{m.role}</strong><time dateTime={m.timestampUtc}>{new Date(m.timestampUtc).toLocaleString()}</time><p data-copyable>{m.text}</p></li>)}</ol></details>}
  <section className="vs-card" aria-label="Checkpoint timeline"><h3>Checkpoints</h3>{!studio.checkpoints.length?<p className="vs-muted">No checkpoints yet.</p>:<ol className="vs-timeline">{studio.checkpoints.map(cp=><li key={cp.checkpointId}><div><strong>{cp.label}</strong><time dateTime={cp.createdAtUtc}>{new Date(cp.createdAtUtc).toLocaleString()}</time></div><button type="button" disabled={!controls.restore||!cp.restorable||!supports('restore')} onClick={()=>setRestore(cp.checkpointId)}><RotateCcw size={14}/>Restore</button>{restore===cp.checkpointId&&<div className="vs-confirm"><p>Restore "{cp.label}" to the real project? A safety checkpoint is taken before restore.</p><div className="vs-actions"><button type="button" disabled={!controls.restore||!supports('restore')} onClick={()=>void onAction({type:'restore',runId:studio.runId,checkpointId:cp.checkpointId}).then(ok=>{if(ok)setRestore(null);})}>Confirm Restore</button><button type="button" disabled={pending} onClick={()=>setRestore(null)}>Cancel</button></div></div>}</li>)}</ol>}</section>
  <form className="vs-steer" aria-label="Steer Studio" onSubmit={e=>{e.preventDefault();if(!steer.trim()||!controls.steer||!supports('steer'))return;void onAction({type:'steer',runId:studio.runId,message:steer.trim()}).then(ok=>{if(ok)setSteer('');});}}><label>Steer at the next step<textarea rows={2} maxLength={8192} value={steer} disabled={!controls.steer||!supports('steer')} onChange={e=>setSteer(e.target.value)} placeholder="Add direction without expanding the folder scope"/></label><button type="submit" disabled={!controls.steer||!steer.trim()||!supports('steer')}><Send size={15}/>Send direction</button></form>
 </div>;
}
