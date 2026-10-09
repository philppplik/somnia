import {useState} from 'react';
import {diffSound} from '../../lib/agent/soundReview';
import {diffPhotoDevelop} from '../../lib/agent/photoDevelopReview';
import {diffDeck} from '../../lib/agent/deckReview';
import type {AgentProposal} from '../../lib/agent/core';
import type {Decisions} from '../../lib/agentDiff';
import {reviewChangeSet} from '../../lib/agentDiff';
/** Scripts and all fetches disabled. This is a source-only isolated preview, not the project renderer. */
export function isolatedHTML(text:string):string {
 return '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src \'none\'; form-action \'none\'; base-uri \'none\'"></head><body>'+text+'</body></html>';
}
export function NativeProposalReview({proposal,onAccept,onReject}:{proposal:AgentProposal;onAccept:(p:AgentProposal,d:Decisions)=>void;onReject:()=>void}){
 const p=proposal.native!;const [busy,setBusy]=useState(false);
 const changes=proposal.lines;
 const settings=p.base.adapter==='sound-settings-v1'?diffSound(p.before,p.after):p.base.adapter==='photo-develop-settings-v1'?diffPhotoDevelop(p.before,p.after):[];
 const slideChanges=p.base.adapter==='deck-text-v1'?diffDeck(p.before,p.after):[];
 return <section className="ag-native-review" aria-label="Review native AI proposal">
  <strong>{p.base.path} · revision {p.base.revision}</strong>
  <p>One complete transaction. No disk write. Source content is untrusted.</p>
  {!!settings.length&&<div aria-label="Settings changes">{settings.map(change=><p key={change.id} data-copyable><strong>{({fadeIn:'Fade in',fadeOut:'Fade out',exposure:'Exposure',contrast:'Contrast',saturation:'Saturation'} as Record<string,string>)[change.id]??change.id}</strong>: {change.before} → {change.after}</p>)}</div>}
  {!!slideChanges.length&&<div aria-label="Slide text changes">{slideChanges.map(change=><section key={`${change.slide}:${change.run}`}><strong>Slide {change.slide+1}, text {change.run+1}</strong><p data-copyable>Before: {change.before}</p><p data-copyable>After: {change.after}</p></section>)}</div>}
  {!proposal.photo&&<details open={!settings.length&&!slideChanges.length}><summary>Source diff · +{proposal.added} -{proposal.removed}</summary><pre data-copyable>{changes.map((l,i)=><div key={i} className={`ag-native-line ag-native-${l.kind}`}>{l.kind==='add'?'+':l.kind==='del'?'-':' '} {l.text}</div>)}</pre></details>}
  {proposal.photo&&<><p>Non-destructive operation: {proposal.photo.operations.map(o=>o.type).join(', ')}. Original pixels stay local and unchanged.</p><pre data-copyable>{JSON.stringify(proposal.photo.operations.map(o=>({type:o.type,params:o.params})),null,2)}</pre><div className="ag-photo-previews"><figure><img src={proposal.photo.before} alt="Before Photo edit"/><figcaption>{proposal.photo.beforeWidth} x {proposal.photo.beforeHeight} px</figcaption></figure><figure><img src={proposal.photo.after} alt="After Photo edit"/><figcaption>{proposal.photo.width} x {proposal.photo.height} px</figcaption></figure></div></>}
  {/\.html?$/i.test(p.base.path)&&<details><summary>Isolated before / after preview</summary><p>Scripts, network, project styles and media are disabled. Check the source diff for the complete change.</p><div className="ag-native-previews"><iframe title="Before AI edit" sandbox="" srcDoc={isolatedHTML(p.before)}/><iframe title="After AI edit" sandbox="" srcDoc={isolatedHTML(p.after)}/></div></details>}
  <div className="ag-native-actions"><button disabled={busy} type="button" onClick={()=>{setBusy(true);const d:Decisions=Object.fromEntries(reviewChangeSet(proposal.changeSet!).flatMap(r=>r.hunks.map(h=>[h.key,'accept'])));onAccept(proposal,d);setTimeout(()=>setBusy(false),500);}}>Accept preview</button><button disabled={busy} type="button" onClick={onReject}>Reject proposal</button></div>
 </section>;
}
