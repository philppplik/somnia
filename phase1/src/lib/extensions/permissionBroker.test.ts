import test from 'node:test';
import assert from 'node:assert/strict';
import example from './contracts/v2/example.json';
import {validateManifestV2,type ManifestV2} from './manifestV2';
import {allowedNetworkUrl,permissionExpansion} from './securityPolicy';
import {PermissionBroker,SECURITY_STORE_KEY,isPathWithin,type ConsentStorage} from './permissionBroker';
import {ExtensionSecurityServices,type ProxyResponse} from './securityServices';
class Memory implements ConsentStorage {values=new Map<string,string>();getItem(k:string){return this.values.get(k)??null;}setItem(k:string,v:string){this.values.set(k,v);}}
function manifest():ManifestV2 {
  const m=structuredClone(example) as ManifestV2;
  m.capabilities.untrustedWorkspaces={supported:'supported'};
  m.security={tier:'A',fs:{read:'ask',write:'project'},network:[{host:'api.example.com',paths:['/repos/*'],reason:'Fetch only public repository metadata'}],secrets:['apiKey'],inject:[{secret:'apiKey',host:'api.example.com',header:'Authorization',prefix:'Bearer '}],agent:{models:['host-default'],reason:'Suggest cleanup through your configured agent'},clipboardRead:{reason:'Paste the image you choose into your project'}};
  return m;
}
function setup(memory=new Memory()) {let time=0;const events:unknown[]=[];const broker=new PermissionBroker(memory,{invalidate:e=>{events.push(e);},notify:e=>{events.push(e);}},()=>time);return {broker,memory,events,clock:(t:number)=>time=t};}
async function approved(m=manifest()) {const env=setup();env.broker.acknowledgeFirstRun();await env.broker.approve(m,'manual');return {...env,m,session:env.broker.openSession(m,{trusted:true,virtual:false})};}
test('security defaults preserve existing v2 manifests and unknown keys fail closed',()=>{
  assert.equal(validateManifestV2(example).ok,true);
  for(const change of [(m:any)=>m.security.unknown=true,(m:any)=>m.security.network[0].host='*.example.com',(m:any)=>m.security.network[0].reason='short',(m:any)=>m.security.inject[0].secret='missing',(m:any)=>m.security.inject[0].header='Cookie',(m:any)=>m.security.network[0].paths=['/a/../private']]) {const m=manifest();change(m);assert.equal(validateManifestV2(m).ok,false);}
  const m=manifest();m.security!.tier='B';assert.equal(validateManifestV2(m,{lane:'store'}).ok,false);
});
test('first launch restricted, persisted review needed, corrupt storage closes all authority',async()=>{
  const {broker,memory}=setup();await broker.approve(manifest(),'manual');assert.throws(()=>broker.openSession(manifest()),/E_RESTRICTED_MODE/);
  await assert.rejects(broker.setRestrictedMode(false),/E_FIRST_RUN_CONFIRMATION_REQUIRED/);
  broker.acknowledgeFirstRun();assert.equal(setup(memory).broker.snapshot().restricted,false);
  memory.setItem(SECURITY_STORE_KEY,'{"version":2,"restricted":false}');assert.equal(setup(memory).broker.snapshot().restricted,true);
});
test('Tier B needs manual install, developer mode and uninterrupted package-bound hold',async()=>{
  const env=setup();const m=manifest();m.security!.tier='B';env.broker.acknowledgeFirstRun();
  await assert.rejects(env.broker.approve(m,'manual'),/E_DEVELOPER_MODE_REQUIRED/);
  await env.broker.setDeveloperMode(true);env.broker.beginNativeHold(m);env.clock(2999);
  await assert.rejects(env.broker.approve(m,'manual'),/E_NATIVE_HOLD_REQUIRED/);
  env.broker.beginNativeHold(m);env.clock(6000);env.broker.cancelNativeHold(m.id);await assert.rejects(env.broker.approve(m,'manual'),/E_NATIVE_HOLD_REQUIRED/);
  env.broker.beginNativeHold(m);env.clock(9001);const changed=structuredClone(m);changed.version='1.2.0';await assert.rejects(env.broker.approve(changed,'manual'),/E_NATIVE_HOLD_REQUIRED/);
  env.broker.beginNativeHold(m);env.clock(12002);await assert.rejects(env.broker.approve(m,'store'),/E_NATIVE_STORE_FORBIDDEN/);
  env.broker.beginNativeHold(m);env.clock(15003);await env.broker.approve(m,'manual');const session=env.broker.openSession(m,{trusted:true,virtual:false});
  await env.broker.setDeveloperMode(false);assert.throws(()=>env.broker.assertCurrent(session),/E_SESSION_REVOKED/);
});
test('project paths require real host canonicalization and no sibling prefix escapes',async()=>{
  assert.equal(isPathWithin('/project','/project-evil/file'),false);assert.equal(isPathWithin('C:\\Project','c:\\project\\ok'),true);assert.equal(isPathWithin('/project','/project/../secret'),false);
  const {broker,session}=await approved();assert.equal(broker.checkFilesystem(session,'write','/project/a','/project','/project').allowed,true);
  assert.equal(broker.checkFilesystem(session,'write','/outside/a','/project','/outside').allowed,false);
  assert.equal(broker.checkFilesystem(session,'read','/secret/symlink-target','/project','/secret').allowed,false);
});
test('runtime prompts coalesce, queue in background, and once is consumed by one call',async()=>{
  const {broker,session}=await approved();const check=()=>broker.checkFilesystem(session,'read','/outside/file','/project','/outside');
  const decision=check();assert.equal(decision.allowed,false);assert.deepEqual(check(),decision);assert.deepEqual(broker.pendingPrompts(false),[]);
  const prompt=broker.pendingPrompts(true)[0];broker.resolvePrompt(prompt.id,'once');assert.equal(check().allowed,true);assert.equal(check().allowed,false);
  broker.resolvePrompt(broker.pendingPrompts(true)[0].id,'session');assert.equal(check().allowed,true);
});
test('remembered grants persist but folder and clipboard revocations kill pending sessions',async()=>{
  const {broker,memory,m,session}=await approved();broker.checkFilesystem(session,'read','/outside/a','/project','/outside');broker.resolvePrompt(broker.pendingPrompts(true)[0].id,'always');
  broker.checkClipboard(session,'read');broker.resolvePrompt(broker.pendingPrompts(true)[0].id,'always');
  const next=setup(memory).broker;const token=next.openSession(m,{trusted:true,virtual:false});assert.equal(next.checkFilesystem(token,'read','/outside/b','/project','/outside').allowed,true);assert.equal(next.checkClipboard(token,'read').allowed,true);
  await next.revokeFolder(m.id,'read','/outside');assert.throws(()=>next.assertCurrent(token),/E_SESSION_REVOKED/);
  await next.setRevoked(m.id,'clipboard.read',true);await next.approve(m,'manual');const reopened=next.openSession(m,{trusted:true,virtual:false});assert.equal(next.checkClipboard(reopened,'read').allowed,false);
});
test('denials suppress repeated prompt, three denials close runtime requests for session',async()=>{
  const {broker,session}=await approved();for(const dir of ['/a','/b','/c']) {broker.checkFilesystem(session,'read',dir+'/file','/project',dir);broker.resolvePrompt(broker.pendingPrompts(true)[0].id,'deny');}
  const denied=broker.checkFilesystem(session,'read','/d/file','/project','/d');assert.deepEqual(denied,{allowed:false,code:'E_PERMISSION_DENIED'});assert.deepEqual(broker.pendingPrompts(true),[]);
});
test('updates never auto-grant expanded scopes or restore revoked permission on rollback',async()=>{
  const {broker,m,session}=await approved();const update=structuredClone(m);update.version='1.1.0';update.security!.network![0].paths=['/'];
  assert.equal(await broker.acceptNonExpandingUpdate(update),false);broker.assertCurrent(session);
  assert.throws(()=>broker.openSession(update,{trusted:true,virtual:false}),/E_CONSENT_REQUIRED/);
  broker.declineUpdate(m.id,update.version);assert.equal(broker.updateReview(update).declined,true);
  await broker.setRevoked(m.id,'project.read',true);await broker.approve(m,'manual');assert.equal(broker.checkPermission(broker.openSession(m,{trusted:true,virtual:false}),'project.read').allowed,false);
  const narrow=structuredClone(m);narrow.version='1.2.0';narrow.security!.network![0].paths=['/repos/one/'];assert.deepEqual(permissionExpansion(m,narrow),[]);assert.equal(await broker.acceptNonExpandingUpdate(narrow),true);
});
test('untrusted workspace ceiling and virtual workspace declaration only restrict',async()=>{
  const {broker,m}=await approved();const s=broker.openSession(m,{trusted:false,virtual:false});assert.equal(broker.checkPermission(s,'project.read').allowed,false);assert.equal(broker.checkNetwork(s,'https://api.example.com/repos/a').allowed,false);assert.equal(broker.checkAgent(s,'host-default').allowed,false);
  m.capabilities.virtualWorkspaces.supported=false;await broker.approve(m,'manual');assert.throws(()=>broker.openSession(m,{trusted:true,virtual:true}),/E_VIRTUAL_WORKSPACE_UNSUPPORTED/);
});
test('blocklist disables, awaits host shutdown, notifies and keeps data without auto-enable',async()=>{
  const {broker,m,session,events}=await approved();await broker.setBlocked(m.id,'Unsafe version');assert.equal(broker.snapshot().extensions[m.id].enabled,false);assert(broker.snapshot().extensions[m.id].approved);assert.throws(()=>broker.assertCurrent(session),/E_SESSION_REVOKED/);
  await assert.rejects(broker.approve(m,'manual'),/E_BLOCKLISTED/);assert.equal(events.length,3);await broker.setBlocked(m.id,null);assert.equal(broker.snapshot().extensions[m.id].enabled,false);
});
test('forged sessions and wrong identity never gain capability',async()=>{
  const {broker,session}=await approved();assert.equal(broker.checkNetwork({generation:session.generation},'https://api.example.com/repos/a').allowed,false);assert.throws(()=>broker.assertIdentity(session,'other.extension'),/E_IDENTITY_MISMATCH/);
});
test('network exact host, HTTPS, bounded query and traversal rules',()=>{
  const scopes=manifest().security!.network!;
  assert(allowedNetworkUrl('https://api.example.com/repos/a?x=1',scopes));
  for(const url of ['http://api.example.com/repos/a','https://api.example.com.evil.test/repos/a','https://user:pass@api.example.com/repos/a','https://api.example.com:444/repos/a','https://api.example.com/private','https://api.example.com/repos/../private','https://api.example.com/repos/%2e%2e/private','https://api.example.com/repos/%252e%252e/private','https://api.example.com/repos/a?x='+'x'.repeat(4097)])assert.equal(allowedNetworkUrl(url,scopes),null,url);
});
async function* body(text:string) {yield new TextEncoder().encode(text);}
function services(broker:PermissionBroker,network:(request:any)=>Promise<ProxyResponse>) {return new ExtensionSecurityServices(broker,{files:{resolve:async()=>{throw Error('not used');}},network:{request:network},secrets:{read:async()=> 'secret'},agent:{complete:async()=> 'result'}});}
test('proxy injects only destination secrets, denies redirect escapes and hides response headers',async()=>{
  const {broker,session,m}=await approved();const calls:any[]=[];const svc=services(broker,async req=>{calls.push(req);return {status:200,headers:{Authorization:'must not return'},body:body('ok')};});
  const result=await svc.request(session,{extensionId:m.id},{url:'https://api.example.com/repos/a'});assert.equal(new TextDecoder().decode(result.body),'ok');assert.equal(calls[0].headers.authorization,'Bearer secret');assert.equal(calls[0].redirect,'manual');assert(!('headers' in result));
  const bad=services(broker,async()=>({status:302,headers:{location:'https://evil.test/steal'},body:body('')}));await assert.rejects(bad.request(session,{extensionId:m.id},{url:'https://api.example.com/repos/a'}),/E_PERMISSION_DENIED/);
  await assert.rejects(svc.request(session,{extensionId:'other.id'},{url:'https://api.example.com/repos/a'}),/E_IDENTITY_MISMATCH/);
});
test('revocation aborts in-flight proxy and agent signals, late results are discarded',async()=>{
  const {broker,session,m}=await approved();let release!:(r:ProxyResponse)=>void;let signal!:AbortSignal;
  const svc=services(broker,req=>{signal=req.signal;return new Promise(resolve=>release=resolve);});const pending=svc.request(session,{extensionId:m.id},{url:'https://api.example.com/repos/a'});
  await new Promise(resolve=>setImmediate(resolve));await broker.disable(m.id);assert.equal(signal.aborted,true);release({status:200,headers:{},body:body('private')});await assert.rejects(pending,/E_SESSION_REVOKED/);
});
test('storage failures fail closed even during revocation',async()=>{
  const {broker,m,session,memory}=await approved();memory.setItem=()=>{throw Error('quota');};await assert.rejects(broker.setRevoked(m.id,'project.read',true),/E_CONSENT_STORAGE_FAILED/);assert.throws(()=>broker.assertCurrent(session),/E_SESSION_REVOKED/);
});

test('network request quota is per extension across sessions',async()=>{
  const {broker,session,m}=await approved();const svc=services(broker,async()=>({status:200,headers:{},body:body('ok')}));
  for(let i=0;i<60;i++)await svc.request(session,{extensionId:m.id},{url:'https://api.example.com/repos/a'});
  const other=broker.openSession(m,{trusted:true,virtual:false});await assert.rejects(svc.request(other,{extensionId:m.id},{url:'https://api.example.com/repos/a'}),/E_RESOURCE_LIMIT/);
});
test('filesystem writes pin handles, abort on revocation and always close',async()=>{
  const {broker,session,m}=await approved();let closed=false,aborted=false;
  const svc=new ExtensionSecurityServices(broker,{files:{resolve:async()=>({canonicalPath:'/project/a',canonicalFolder:'/project',projectRoot:'/project',read:async()=>new Uint8Array(),writeAtomic:async(_bytes,signal)=>{await broker.setRevoked(m.id,'fs.write',true);aborted=signal.aborted;if(aborted)throw Error('E_CANCELLED');},close:()=>{closed=true;}})},network:{request:async()=>{throw Error('not used');}},secrets:{read:async()=>null},agent:{complete:async()=>''}});
  await assert.rejects(svc.writeFile(session,'a',new Uint8Array([1]),new AbortController().signal),/E_CANCELLED/);assert.equal(closed,true);assert.equal(aborted,true);
});
test('revoked queued runtime prompts cannot grant authority after lifecycle change',async()=>{
  const {broker,m,session}=await approved();broker.checkClipboard(session,'read');const prompt=broker.pendingPrompts(true)[0];await broker.setRevoked(m.id,'clipboard.read',true);assert.throws(()=>broker.resolvePrompt(prompt.id,'always'),/E_STALE_PROMPT/);
});

test('legacy startup gate does not run extensions before first-run review',async()=>{
  const {extensionsRestricted}=await import('./restrictedMode');const {broker,memory}=setup();assert.equal(extensionsRestricted(memory),true);broker.acknowledgeFirstRun();assert.equal(extensionsRestricted(memory),false);await broker.setRestrictedMode(true);assert.equal(extensionsRestricted(memory),true);
});
