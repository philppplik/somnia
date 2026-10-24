import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {NativeProposalReview} from './agent/NativeProposalReview';
import {AgentConsentNotice} from './agent/AgentPrivacy';
import type {AgentProposal} from '../lib/agent/core';

const proposal:AgentProposal={id:'p1',file:'notes.txt',added:1,removed:1,
 lines:[{kind:'del',text:'old line'},{kind:'add',text:'new line'},{kind:'ctx',text:'kept'}],
 native:{id:'proposal-1',runId:'run-1',
  base:{documentId:'doc-1',path:'notes.txt',studioKind:'code',revision:3,adapter:null},
  before:'old line',after:'new line',state:'review',origin:'ai:run-1:proposal-1'}};

test('proposal review actions render as native buttons',()=>{
 const html=renderToStaticMarkup(<NativeProposalReview proposal={proposal} onAccept={()=>{}} onReject={()=>{}}/>);
 assert.match(html,/<button[^>]*data-slot="native-button"[^>]*type="button"[^>]*>Accept preview<\/button>/);
 assert.match(html,/<button[^>]*data-slot="native-button"[^>]*type="button"[^>]*>Reject proposal<\/button>/);
 assert.match(html,/notes\.txt · revision 3/);
});

test('consent notice keeps inline-sized checkbox and gated enable button through native primitives',()=>{
 const html=renderToStaticMarkup(<AgentConsentNotice showTitle={false}/>);
 assert.match(html,/<input[^>]*data-slot="native-input"[^>]*type="checkbox"[^>]*>/);
 assert.match(html,/style="[^"]*width:16px/,'inline checkbox sizing preserved');
 const enable=html.match(/<button[^>]*data-slot="native-button"[^>]*disabled=""[^>]*>/g)??[];
 assert.ok(enable.length>=1,'enable action stays disabled until consent is checked');
});

test('no raw form controls remain anywhere in the agent area',()=>{
 const dir=new URL('./agent/',import.meta.url);
 for(const f of readdirSync(dir).filter(f=>f.endsWith('.tsx')&&!f.includes('.test.'))) {
  const source=readFileSync(new URL(f,dir),'utf8');
  assert.doesNotMatch(source,/<(button|input|select|textarea)\b/,f);
 }
});

test('sound proposals mount the audible Sound review (diff plus preview button), accept stays with the host',()=>{
 const soundProposal:AgentProposal={id:'p2',file:'mix.mp3',added:1,removed:1,
  lines:[{kind:'del',text:'{}'},{kind:'add',text:'{"pitch":2}'}],
  native:{id:'proposal-2',runId:'run-1',
   base:{documentId:'doc-2',path:'mix.mp3',studioKind:'sound',revision:1,adapter:'sound-settings-v1'},
   before:'{}',after:'{"pitch":2}',state:'review',origin:'ai:run-1:proposal-2'}};
 const html=renderToStaticMarkup(<NativeProposalReview proposal={soundProposal} onAccept={()=>{}} onReject={()=>{}}/>);
 assert.match(html,/data-testid="sound-review"/,'the Sound-owned review body is mounted');
 assert.match(html,/data-testid="sound-review-pitch"/,'the settings diff is shown');
 assert.match(html,/0 st → 2 st/,'before and after values are visible');
 assert.match(html,/data-testid="sound-review-preview"/,'the audible preview action is offered');
 assert.match(html,/>Accept preview</,'accept stays with the shared host');
});
