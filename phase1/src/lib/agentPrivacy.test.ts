import test from 'node:test';
import assert from 'node:assert/strict';
import {AGENT_CONSENT_KEY, AGENT_CONSENT_VERSION, AgentPrivacyGate, AgentConsentRequiredError, isLocalOllama, createAIProvenance} from './agent/privacy';
import {AGENT_PRIVACY_EN} from './agent/privacyStrings';
import {CATALOGUES} from './i18n';
function setup() {
  const data = new Map<string, string>();
  const storage = {getItem: (key:string) => data.get(key) ?? null, setItem: (key:string,value:string) => {data.set(key,value);}, removeItem: (key:string) => {data.delete(key);}};
  return {data, storage, gate: new AgentPrivacyGate(() => storage)};
}
const cloud = {provider:'openrouter'};
test('default deny includes unknown providers and remote Ollama', async () => {
  const {gate} = setup(); let called = false;
  for (const target of [cloud,{provider:'openai'},{provider:'anthropic'},{provider:'future'}, {provider:'ollama'}, {provider:'ollama',processing:'local' as const,endpoint:'https://remote.example'}]) {
    await assert.rejects(gate.run(target, async () => {called = true;}), AgentConsentRequiredError);
  }
  assert.equal(called,false);
});
test('only explicit local http Ollama is exempt, not credentials, deceptive hosts or remote endpoints', () => {
  for (const host of ['localhost','127.0.0.1','127.0.0.2','[::1]']) assert.equal(isLocalOllama({provider:'ollama',processing:'local' as const,endpoint:`http://${host}:11434`}),true);
  for (const endpoint of ['http://localhost.evil.test','https://localhost','http://user:pass@localhost','file:///localhost','http://192.168.1.5','nonsense']) assert.equal(isLocalOllama({provider:'ollama',endpoint}),false);
  assert.equal(isLocalOllama({provider:'openai',endpoint:'http://localhost'}),false);
});
test('cloud-backed and unknown Ollama models never bypass consent', () => {
 for (const processing of ['cloud', undefined] as const) assert.equal(isLocalOllama({provider:'ollama',endpoint:'http://localhost:11434',processing}),false);
});
test('malformed and older consent never enables cloud', () => {
  const {gate,data} = setup();
  for (const record of ['garbage','{}',JSON.stringify({version:0,grantedAt:new Date().toISOString()}),JSON.stringify({version:AGENT_CONSENT_VERSION,grantedAt:'bad'})]) {
    data.set(AGENT_CONSENT_KEY,record); assert.equal(gate.hasConsent(),false);
  }
});
test('explicit grant, persisted reload, withdrawal and fresh grant', async () => {
  const {gate,storage} = setup();
  assert.equal(gate.grantExplicitConsent(),true);
  assert.equal(new AgentPrivacyGate(() => storage).hasConsent(),true);
  assert.equal(await gate.run(cloud,async () => 'ok'),'ok');
  gate.revoke(); assert.equal(gate.hasConsent(),false);
  assert.equal(new AgentPrivacyGate(() => storage).hasConsent(),false);
  assert.equal(gate.grantExplicitConsent(),true); assert.equal(gate.hasConsent(),true);
});
test('unavailable storage is fail closed', () => {
  const gate = new AgentPrivacyGate(() => {throw Error('storage denied');});
  assert.equal(gate.grantExplicitConsent(),false); assert.equal(gate.hasConsent(),false);
  gate.revoke(); assert.throws(() => gate.assert(cloud),AgentConsentRequiredError);
});
test('withdrawal aborts active cloud request and rejects late output even if transport ignores abort', async () => {
  const {gate} = setup(); gate.grantExplicitConsent();
  let signal:AbortSignal|undefined; let release!:(value:string)=>void;
  const running = gate.run(cloud,async s => {signal = s; return new Promise<string>(resolve => {release=resolve;});});
  gate.revoke(); assert.equal(signal?.aborted,true); release('late');
  await assert.rejects(running,AgentConsentRequiredError);
});
test('cross-window withdrawal stops cloud but leaves local calls alone', async () => {
  const {gate,data} = setup(); gate.grantExplicitConsent();
  let localSignal:AbortSignal|undefined; let release!:()=>void;
  const local = gate.run({provider:'ollama',processing:'local' as const,endpoint:'http://localhost:11434'},async signal=>{localSignal=signal;return new Promise<void>(resolve=>{release=resolve;});});
  data.delete(AGENT_CONSENT_KEY); gate.syncFromStorage();
  assert.equal(gate.hasConsent(),false); assert.equal(localSignal?.aborted,false); release(); await local;
});
test('caller cancellation is passed through and no request occurs if already cancelled',async()=>{
 const {gate}=setup();gate.grantExplicitConsent();const controller=new AbortController();controller.abort();let called=false;
 await assert.rejects(gate.run(cloud,async()=>{called=true;},controller.signal));assert.equal(called,false);
});
test('AI provenance stays AI-generated after review and every locale includes source keys',()=>{
 const meta=createAIProvenance('openrouter','model'); assert.equal(meta.generatedBy,'ai');assert.equal(meta.humanReviewed,false);
 for(const [locale,cat] of Object.entries(CATALOGUES))for(const key of Object.keys(AGENT_PRIVACY_EN))assert.ok(cat[key],`${locale}:${key}`);
 for(const [key,value] of Object.entries(AGENT_PRIVACY_EN))assert.equal(CATALOGUES.en[key],value);
});
