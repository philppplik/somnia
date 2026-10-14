import {useState} from 'react';
import {NativeProposalReview} from '../../src/components/agent/NativeProposalReview';
import {AgentConsentNotice} from '../../src/components/agent/AgentPrivacy';
import type {AgentProposal} from '../../src/lib/agent/core';
import '../../src/styles/agent.css';

const proposal:AgentProposal={id:'p1',file:'notes.txt',added:1,removed:1,
 lines:[{kind:'del',text:'old line'},{kind:'add',text:'new line'},{kind:'ctx',text:'kept'}],
 native:{id:'proposal-1',runId:'run-1',
  base:{documentId:'doc-1',path:'notes.txt',studioKind:'code',revision:3,adapter:null},
  before:'old line',after:'new line',state:'review',origin:'ai:run-1:proposal-1'}};

/** Real migrated agent surfaces over fixtures; actions are logged, never executed. */
export function AgentProof(){
 const [events,setEvents]=useState<string[]>([]);
 const log=(entry:string)=>setEvents(old=>[...old,entry]);
 return <main data-testid="agent-proof"><h1>Agent area DS adoption</h1><p>Actual proposal review and consent notice on fixtures; every control renders through native control primitives.</p>
  <NativeProposalReview proposal={proposal} onAccept={()=>log('accept')} onReject={()=>log('reject')}/>
  <AgentConsentNotice onGranted={()=>log('granted')}/>
  <pre data-testid="agent-proof-events" aria-label="Fixture events">{events.join('\n')}</pre></main>;
}
