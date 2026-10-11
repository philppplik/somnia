/** QA component tests (jsdom). Not a substitute for the real-browser fixture. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {dom} from './qa-dom';
import {createRoot} from 'react-dom/client';import {act} from 'react';
import {VibeSpaceHome} from './VibeSpaceHome';import {CreateStudioForm} from './CreateForms';
import {createFixtureVibeSpaceTransport,fixtureSnapshot} from '../../lib/vibespace/fixture';
const flush=()=>act(async()=>{await new Promise(r=>setTimeout(r,5));});
const mount=async(node:React.ReactElement)=>{const el=document.createElement('div');document.body.appendChild(el);const root=createRoot(el);await act(async()=>{root.render(node);});await flush();return {el,root};};
const btn=(el:Element,name:RegExp)=>[...el.querySelectorAll('button')].find(b=>name.test(b.textContent??''))!;

test('QA component: destroyed panel ignores late events, releases the subscription and logs no React errors',async()=>{
 const errors:unknown[]=[];const orig=console.error;console.error=(...a:unknown[])=>{errors.push(a);};
 try{
  const t=createFixtureVibeSpaceTransport('test');let off=0;const sub=t.subscribe;t.subscribe=async(on,err)=>{const o=await sub(on,err);return()=>{off++;o();};};
  const {el,root}=await mount(<VibeSpaceHome transport={t}/>);assert.match(el.textContent??'',/Vibe Space/);
  await act(async()=>{root.unmount();});
  const run=fixtureSnapshot().studios[0];const {sequence:_s,...payload}=run;
  assert.doesNotThrow(()=>t.emit({protocolVersion:1,runId:run.runId,sequence:2,timestampUtc:'2026-10-11T10:00:00Z',kind:'run_snapshot',payload}));await flush();
  assert.equal(off,1);assert.deepEqual(errors,[]);
 }finally{console.error=orig;}
});
test('QA component: a live event is shown, then a gap event disables every action control and shows the reload banner',async()=>{
 const t=createFixtureVibeSpaceTransport('test');const {el}=await mount(<VibeSpaceHome transport={t}/>);
 const base=fixtureSnapshot().studios.find(s=>s.runId==='run-images')!;const {sequence:_s,...p}=base;
 await act(async()=>{t.emit({protocolVersion:1,runId:'run-images',sequence:2,timestampUtc:'2026-10-11T10:00:00Z',kind:'run_snapshot',payload:{...p,lastStep:'LIVE-STEP'}});});assert.match(el.textContent??'',/LIVE-STEP/);
 await act(async()=>{t.emit({protocolVersion:1,runId:'run-images',sequence:9,timestampUtc:'2026-10-11T10:00:00Z',kind:'run_snapshot',payload:{...p,lastStep:'GAP'}});});await flush();
 assert.ok(el.querySelector('[role=alert]'),'banner');assert.doesNotMatch(el.textContent??'',/GAP/);
 assert.ok(btn(el,/New space/).disabled);assert.ok(btn(el,/New Studio/).disabled);
});
test('QA component: consent buttons act only on the open run and request (wrong-run safe)',async()=>{
 const t=createFixtureVibeSpaceTransport('test');const {el}=await mount(<VibeSpaceHome transport={t}/>);
 await act(async()=>{btn(el,/Check external links/).click();});
 assert.ok(btn(el,/Allow for this run/).disabled,'allowForRun=false');
 await act(async()=>{btn(el,/^Deny$/).click();});await flush();
 const c=t.calls.at(-1)!;assert.deepEqual([c.type,'runId'in c&&c.runId,'requestId'in c&&c.requestId,'choice'in c&&c.choice],['consent','run-network','request-1','deny']);
});
test('QA component F-6: Create Studio submits the model the user chose even if the model list reorders while the form is open',async()=>{
 const a={provider:'p',model:'a',locality:'local' as const},b={provider:'p',model:'b',locality:'local' as const};const space=fixtureSnapshot().spaces[0];
 let sent:unknown=null;const el=document.createElement('div');document.body.appendChild(el);const root=createRoot(el);
 const ui=(models:typeof a[])=><CreateStudioForm space={space} models={models} busy={false} template="goal" onCreate={async i=>{sent=i;return true;}} onClose={()=>{}}/>;
 await act(async()=>{root.render(ui([a,b]));});
 const sel=el.querySelector('select')!;assert.equal(el.querySelectorAll('option').length,3);await act(async()=>{const set=Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value')!.set!;set.call(sel,JSON.stringify(['p','b','local']));sel.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 await act(async()=>{root.render(ui([b,a]));});
 await act(async()=>{el.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));});
 assert.equal((sent as {model:{model:string}}).model.model,'b');
});

test('QA N2: a consumed folder grant is dropped after Create Space (success or failure); a fresh Choose folder is required to retry',async()=>{
 const {CreateSpaceForm}=await import('./CreateForms');
 const el=document.createElement('div');document.body.appendChild(el);const root=createRoot(el);const sent:string[]=[];let chosen=0;let ok=false;
 await act(async()=>{root.render(<CreateSpaceForm busy={false} onChoose={async()=>({folderGrantId:`g${++chosen}`,folder:'/f'})} onCreate={async i=>{sent.push((i as {folderGrantId:string}).folderGrantId);return ok;}} onClose={()=>{}}/>);});
 const set=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!;const input=el.querySelector('input')!;
 await act(async()=>{input.focus();set.call(input,'Name');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 const choose=()=>act(async()=>{[...el.querySelectorAll('button')].find(b=>/Choose folder/.test(b.textContent??''))!.click();;await new Promise(r=>setTimeout(r,5));});
 const submit=()=>act(async()=>{el.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));});
 await choose();await submit();assert.deepEqual(sent,['g1']);
 const create=[...el.querySelectorAll('button')].find(b=>/^Create Vibe Space$/.test(b.textContent??''))!;assert.ok(create.disabled,'grant consumed');
 await submit();assert.deepEqual(sent,['g1'],'no second submit with a consumed grant');
 await choose();ok=true;await submit();assert.deepEqual(sent,['g1','g2']);
});
