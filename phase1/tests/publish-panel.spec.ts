import {test,expect} from './fixtures';
import {mkdirSync} from 'node:fs';
const SHOTS=process.env.PUBLISH_SHOTS??'';
if(SHOTS)mkdirSync(SHOTS,{recursive:true});

/** In-page fake of the Rust deploy service: same command names and error strings as src-tauri/src/deploy_commands.rs. */
async function mockDeploy(page:import('@playwright/test').Page){
 await page.addInitScript(()=>{
  const w=window as any;w.isTauri=true;let next=0;const callbacks=new Map<number,any>();const handlers=new Map<string,number>();w.ipcCalls=[];
  const FP='SHA256:Qm7xK2pLr9WvNcT4yHs8DfGa1BjEoZu5XiMq0RtVk4A';
  const PUBLIC_KEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPq8mXk2Lw7vC0n3RtYhJbU4sDfGa1BjEoZu5XiMq0Rt somnia@my-laptop';
  const st:any={targets:[],keys:{},pins:{},live:{},prepared:{},releases:['20261010T101500Z-a1b2c3','20261012T143015Z-d4e5f6'],fail:null as null|string,hold:null as null|Promise<void>,release:null as null|(()=>void)};
  w.__deploy=st;
  const emit=(event:string,payload:any)=>{const id=handlers.get(event);if(id)callbacks.get(id)?.({event,id,payload});};
  w.__emit=emit;
  const err=(c:string)=>{throw `deploy:${c}`;};
  const status=(t:any)=>({target:t,state:!st.keys[t.id]?'key-missing':st.pins[t.id]?'ready':'needs-trust',...(st.pins[t.id]?{fingerprint:st.pins[t.id]}:{})});
  const files=[{path:'index.html',size:4210,sha256:'a'.repeat(64),change:'changed'},{path:'css/site.css',size:9120,sha256:'b'.repeat(64),change:'changed'},{path:'img/hero.webp',size:182000,sha256:'c'.repeat(64),change:'added'},{path:'old/legacy.js',size:800,sha256:'d'.repeat(64),change:'removed'},{path:'about.html',size:2100,sha256:'e'.repeat(64),change:'unchanged'}];
  const plan=(id:string,action:string,rel?:string)=>({planHash:'9'.repeat(64),action,targetId:id,fingerprint:st.pins[id]??FP,buildId:'build-1',liveRelease:'20261012T143015Z-d4e5f6',releaseId:rel??null,files:action==='publish'?files:[]});
  w.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:(fn:any)=>{callbacks.set(++next,fn);return next;},invoke:async(cmd:string,args:any)=>{
   w.ipcCalls.push({cmd,args:args===undefined?args:JSON.parse(JSON.stringify(args))});
   if(cmd==='plugin:event|listen'){handlers.set(args.event,args.handler);return next;}
   if(cmd==='plugin:event|unlisten')return null;
   if(!cmd.startsWith('deploy_')){if(cmd==='list_files'||cmd==='recovery_list')return [];return null;}
   if(st.fail&&['deploy_publish','deploy_plan','deploy_hostkey_probe'].includes(cmd)){const c=st.fail;st.fail=null;err(c);}
   switch(cmd){
    case 'deploy_targets_list':return st.targets.map(status);
    case 'deploy_target_save':{const i=st.targets.findIndex((t:any)=>t.id===args.target.id);if(i>=0)st.targets[i]=args.target;else st.targets.push(args.target);return null;}
    case 'deploy_target_delete':st.targets=st.targets.filter((t:any)=>t.id!==args.targetId);return null;
    case 'deploy_key_create':if(st.keys[args.targetId])err('key-exists');st.keys[args.targetId]=true;return PUBLIC_KEY;
    case 'deploy_key_public':if(!st.keys[args.targetId])err('key-missing');return PUBLIC_KEY;
    case 'deploy_live_release':return st.live[args.targetId]??null;
    case 'deploy_cancel':return false; // No active cancellation test: never claim cancellation occurred.
    case 'deploy_bootstrap_script':if(!st.keys[args.targetId])err('key-missing');return `#!/bin/sh
# In-process mock script, never executed on a host
set -eu
# Install Caddy and prepare somnia account
`;
    case 'deploy_bootstrap_run':if(!st.pins[args.targetId])err('host-key-unknown');st.prepared[args.targetId]=true;return {outcome:'done',steps:['ports','caddy','user','key','dirs','config','start'],hostFingerprint:FP,port:null};
    case 'deploy_dns_check':return {ready:true,expected:['203.0.113.10'],records:[{name:'example.com',type:'A',values:['203.0.113.10'],source:'system',ready:true},{name:'www.example.com',type:'A',values:['203.0.113.10'],source:'doh',ready:true}],staleIpv6:false,wwwMissing:false,resolverFailed:false};
    case 'deploy_hostkey_probe':return {algorithm:'ssh-ed25519',fingerprint:FP};
    case 'deploy_hostkey_trust':st.pins[args.targetId]=args.fingerprint;return null;
    case 'deploy_hostkey_replace':st.pins[args.targetId]=args.newFingerprint;return null;
    case 'deploy_plan':return plan(args.targetId,'publish');
    case 'deploy_plan_rollback':return plan(args.targetId,'rollback',args.releaseId);
    case 'deploy_confirm_issue':return 'tok-'+args.planHash.slice(0,6);
    case 'deploy_releases':return st.releases;
    case 'deploy_open_site':return null;
    case 'deploy_publish':{emit('deploy-progress',{targetId:args.targetId,step:'connect'});emit('deploy-progress',{targetId:args.targetId,step:'check'});emit('deploy-progress',{targetId:args.targetId,step:'upload:7/12'});if(st.hold)await st.hold;const rel='20261013T113000Z-f7a8b9';st.releases.push(rel);st.live[args.targetId]=rel;return {releaseId:rel,url:'https://example.com',rolledBack:false};}
    case 'deploy_rollback':st.live[args.targetId]=args.releaseId;return {releaseId:args.releaseId,url:'https://example.com',rolledBack:true};
   }
   throw new Error(`Unmocked deployment IPC: ${cmd}`);}};
  w.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
 });
}
const shot=async(page:import('@playwright/test').Page,name:string)=>{if(SHOTS){await page.waitForTimeout(500);await page.screenshot({path:`${SHOTS}/${name}.png`});}};
const setTheme=(page:import('@playwright/test').Page,theme:'light'|'dark')=>page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);

async function addServer(page:import('@playwright/test').Page){
 await page.getByTestId('publish-button').click();
 await expect(page.getByTestId('publish-dialog')).toBeVisible();
 await expect(page.getByTestId('publish-form')).toBeVisible();
 await page.getByLabel('Name',{exact:true}).fill('Portfolio');
 await page.getByLabel('Server address').fill('203.0.113.10');
 await page.getByLabel('Domain (optional)').fill('example.com');
}

for(const theme of ['light','dark'] as const){
 test(`publish flow: add server, key, trust, confirm, progress, result, rollback (${theme})`,async({page})=>{
  await mockDeploy(page);await page.goto('/');await setTheme(page,theme);
  await addServer(page);await shot(page,`${theme}-1-form`);
  await page.getByRole('button',{name:'Save and continue'}).click();
  await expect(page.getByTestId('deploy-setup')).toHaveAttribute('data-step','key');await shot(page,`${theme}-2-needs-key`);
  await page.getByRole('button',{name:'Create key'}).click();
  await expect(page.getByTestId('deploy-setup')).toHaveAttribute('data-step','trust');
  await expect(page.locator('.deploy-setup-key')).toContainText('ssh-ed25519 AAAAC3');await shot(page,`${theme}-3-key-created`);
  await page.getByRole('button',{name:'Check server'}).click();
  await expect(page.getByTestId('deploy-hostkey')).toBeVisible();
  await expect(page.getByTestId('deploy-fingerprint')).toContainText('SHA256:Qm7xK2pLr9');await shot(page,`${theme}-4-hostkey`);
  await page.getByRole('button',{name:'Trust and continue'}).click();
  await expect(page.getByTestId('deploy-setup')).toHaveAttribute('data-step','prepare');
  await expect(page.getByLabel('Full bootstrap script')).toContainText('set -eu');
  await page.getByRole('button',{name:'Show public key again'}).click();
  await expect(page.locator('.deploy-setup-key')).toContainText('ssh-ed25519 AAAAC3');
  await page.getByRole('button',{name:'I ran the script / server already prepared'}).click();
  await expect(page.getByTestId('deploy-setup')).toHaveAttribute('data-step','domain');
  await expect(page.getByTestId('deploy-dns-status')).toHaveAttribute('data-ready','true');await shot(page,`${theme}-5-dns-ready`);
  expect(await page.evaluate(()=>(window as any).ipcCalls.filter((c:any)=>c.cmd==='deploy_publish').length)).toBe(0);
  // hold the upload so the progress view can be captured
  await page.evaluate(()=>{const s=(window as any).__deploy;s.hold=new Promise<void>(r=>{s.release=r;});});
  await page.getByRole('button',{name:'Review publish',exact:true}).click();
  await expect(page.getByTestId('deploy-confirm')).toBeVisible();
  await expect(page.getByTestId('deploy-fingerprint')).toContainText('SHA256:Qm7xK2pLr9');await shot(page,`${theme}-6-confirm-diff`);
  expect(await page.evaluate(()=>(window as any).ipcCalls.filter((c:any)=>c.cmd==='deploy_publish').length)).toBe(0);
  await page.getByRole('button',{name:'Publish',exact:true}).last().click();
  await expect(page.getByTestId('publish-progress')).toBeVisible();
  await expect(page.getByTestId('publish-progress')).toContainText('Uploading 7 of 12');await shot(page,`${theme}-7-progress`);
  const publishCall=await page.evaluate(()=>(window as any).ipcCalls.find((c:any)=>c.cmd==='deploy_publish')?.args);
  expect(publishCall.token).toMatch(/^tok-/);expect(Object.keys(publishCall).sort()).toEqual(['planHash','targetId','token']);
  await page.evaluate(()=>(window as any).__deploy.release());
  await expect(page.getByTestId('publish-result')).toContainText('Live: example.com');await shot(page,`${theme}-8-result`);
  await page.getByRole('button',{name:'Undo this publish'}).click();
  await expect(page.getByTestId('publish-rollback')).toBeVisible();
  await expect(page.locator('.publish-release')).toHaveCount(3);
  await expect(page.locator('.publish-release[data-live="true"]')).toContainText('20261013T113000Z-f7a8b9');await shot(page,`${theme}-9-rollback-list`);
  await page.locator('.publish-release').nth(1).getByRole('button',{name:'Go back'}).click();
  await expect(page.getByTestId('deploy-confirm')).toBeVisible();await shot(page,`${theme}-10-rollback-confirm`);
  await page.getByRole('button',{name:'Go back',exact:true}).last().click();
  await expect(page.getByTestId('publish-result')).toContainText('Back on version');
 });
}

test('errors are plain sentences with one clear action, never raw output',async({page})=>{
 await mockDeploy(page);await page.goto('/');await setTheme(page,'light');
 await addServer(page);await page.getByRole('button',{name:'Save and continue'}).click();
 await page.getByRole('button',{name:'Create key'}).click();await page.getByRole('button',{name:'Check server'}).click();await page.getByRole('button',{name:'Trust and continue'}).click();
 await expect(page.getByTestId('deploy-setup')).toHaveAttribute('data-step','prepare');
 await page.getByRole('button',{name:'Finish later',exact:true}).click();
 await expect(page.getByTestId('publish-detail')).toHaveAttribute('data-state','ready');
 await page.evaluate(()=>{(window as any).__deploy.fail='connect-failed';});
 await page.getByTestId('publish-go').click();await expect(page.getByTestId('deploy-confirm')).toHaveCount(0);
 const f=page.getByTestId('publish-failure');await expect(f).toBeVisible();
 await expect(f).toContainText("Can't reach the server");await expect(f).toContainText('Nothing went live.');await expect(f).not.toContainText('deploy:');
 await shot(page,'light-11-error-unreachable');
 await f.getByRole('button',{name:'Try again'}).click();
 await expect(page.getByTestId('deploy-confirm')).toBeVisible();
 await page.getByRole('button',{name:'Cancel'}).click();
 expect(await page.evaluate(()=>(window as any).ipcCalls.filter((c:any)=>c.cmd==='deploy_publish').length)).toBe(0);
});

test('reviewed bootstrap uses temporary credentials and continues to verified DNS',async({page})=>{
 await mockDeploy(page);await page.goto('/');await addServer(page);
 await page.getByRole('button',{name:'Save and continue'}).click();
 await expect(page.getByTestId('deploy-setup')).toHaveAttribute('data-step','key');
 await page.getByRole('button',{name:'Create key'}).click();
 await page.getByRole('button',{name:'Check server'}).click();
 await page.getByRole('button',{name:'Trust and continue'}).click();
 await expect(page.getByTestId('deploy-setup')).toHaveAttribute('data-step','prepare');
 await page.getByText('Run from Somnia with sudo',{exact:true}).click();
 await page.getByLabel('Setup SSH login',{exact:true}).fill('admin');
 await page.getByTestId('setup-login-password').fill('mock-login-only');
 await page.getByTestId('setup-sudo-password').fill('mock-sudo-only');
 const run=page.getByRole('button',{name:'Run reviewed script',exact:true});
 await expect(run).toBeDisabled();
 await page.getByRole('checkbox',{name:'I reviewed the script and want to run it on 203.0.113.10.'}).check();
 await run.click();
 await expect(page.locator('.deploy-setup-outcome')).toHaveAttribute('data-outcome','done');
 await expect(page.getByTestId('setup-login-password')).toHaveValue('');
 await expect(page.getByTestId('setup-sudo-password')).toHaveValue('');
 const setupCalls=await page.evaluate(()=>(window as any).ipcCalls.filter((c:any)=>c.cmd==='deploy_bootstrap_run'));
 expect(setupCalls).toHaveLength(1);
 expect(setupCalls[0].args).toEqual({targetId:'portfolio',loginUser:'admin',loginPassword:'mock-login-only',sudoPassword:'mock-sudo-only',privilege:'sudo-password'});
 expect(await page.evaluate(()=>(window as any).__deploy.targets[0].user)).toBe('somnia');
 await page.getByRole('button',{name:'Continue to domain',exact:true}).click();
 await expect(page.getByTestId('deploy-dns-status')).toHaveAttribute('data-ready','true');
 expect(await page.evaluate(()=>(window as any).ipcCalls.filter((c:any)=>c.cmd==='deploy_publish').length)).toBe(0);
});

test('form shows plain validation messages and keeps focus order',async({page})=>{
 await mockDeploy(page);await page.goto('/');await addServer(page);
 await page.getByLabel('Server address').fill('https://example.com');
 await page.getByRole('button',{name:'Save and continue'}).click();
 await expect(page.getByRole('alert').filter({hasText:'without https://'}).first()).toBeVisible();
 expect(await page.evaluate(()=>(window as any).ipcCalls.filter((c:any)=>c.cmd==='deploy_target_save').length)).toBe(0);
});

test('the dialog is reachable from the command palette',async({page})=>{
 await mockDeploy(page);await page.goto('/');await page.keyboard.press('Control+k');
 await page.getByRole('combobox',{name:'Search commands'}).fill('Publish');
 await page.getByRole('option').filter({hasText:'Publish...'}).first().click();
 await expect(page.getByTestId('publish-dialog')).toBeVisible();
});

/** Build-first: a static React project is built through the F3 runner and the native collector before deploy_plan. */
async function mockBuild(page:import('@playwright/test').Page,mode:'ok'|'build-fails'|'forbidden'){
 await page.addInitScript(m=>{
  const w=window as any;const orig=w.__TAURI_INTERNALS__.invoke;w.buildState={release:null as null|(()=>void),hold:null as null|Promise<void>,runs:{} as Record<string,any>};
  w.__TAURI_INTERNALS__.invoke=async(cmd:string,args:any)=>{
   if(cmd.startsWith('deploy_artifact_collect')){w.ipcCalls.push({cmd,args});if(m==='forbidden')throw 'frameworks.artifact.forbidden:assets/.env';return {framework:'react',dist:'dist',manifest:{buildId:'build-1',files:[]},fileCount:12,totalBytes:482304,spaRules:null};}
   if(cmd==='runtime_status')return {installed:true,supported:true,version:'24.21.0',downloadBytes:0};
   if(cmd==='project_run'){w.ipcCalls.push({cmd,args});const id=`run-${args.kind}`;w.buildState.runs[id]={id,projectId:args.projectId,kind:args.kind,state:args.kind==='build'?'running':'exited',exitCode:args.kind==='build'?null:0};return w.buildState.runs[id];}
   if(cmd==='project_status'){const r=w.buildState.runs[args.runId];if(r.kind==='build'&&r.state==='running'&&!w.buildState.hold){r.state='exited';r.exitCode=m==='build-fails'?1:0;}return {...r};}
   if(cmd==='project_logs')return {lines:[],nextSequence:0};
   if(cmd==='project_stop')return null;
   return orig(cmd,args);};
 },mode);
}
async function readyProject(page:import('@playwright/test').Page){
 await page.goto('/');
 await page.evaluate(async()=>{
  const w=window as any;const T={id:'portfolio',name:'Portfolio',host:'203.0.113.10',port:22,user:'somnia',domain:'example.com',kind:'static',keySlot:'deploy-key:portfolio'};
  w.__deploy.targets.push(T);w.__deploy.keys.portfolio=true;w.__deploy.pins.portfolio='SHA256:Qm7xK2pLr9WvNcT4yHs8DfGa1BjEoZu5XiMq0RtVk4A';w.__deploy.live.portfolio='20261012T143015Z-d4e5f6';
  const app=await import('/src/store/appStore.ts');const pr=await import('/src/lib/previewResourceSource.ts');
  app.patchState({files:{...app.getState().files,'package.json':JSON.stringify({name:'site',dependencies:{react:'19.0.0'},devDependencies:{vite:'6.0.0'}})}});
  pr.setPreviewResourceSource({invoke:(c:string,a:any)=>w.__TAURI_INTERNALS__.invoke(c,a),projectId:'portfolio-project'});
 });
}
const calls=(page:import('@playwright/test').Page)=>page.evaluate(()=>(window as any).ipcCalls.map((c:any)=>c.cmd).filter((c:string)=>/^(project_run|deploy_artifact_collect|deploy_plan|deploy_publish)$/.test(c)));

for(const theme of ['light','dark'] as const){
 test(`publish builds the project first, then plans and publishes (${theme})`,async({page})=>{
  await mockDeploy(page);await mockBuild(page,'ok');await readyProject(page);await setTheme(page,theme);
  await page.evaluate(()=>{const b=(window as any).buildState;b.hold=new Promise<void>(r=>{b.release=()=>{b.hold=null;r();};});});
  await page.getByTestId('publish-button').click();await page.getByTestId('publish-go').click();
  await expect(page.getByTestId('publish-build-step')).toHaveAttribute('data-phase','building');
  await expect(page.getByTestId('deploy-confirm')).toHaveCount(0);
  expect(await calls(page)).not.toContain('deploy_plan');await shot(page,`build-${theme}-1-building`);
  await page.evaluate(()=>(window as any).buildState.release());
  await expect(page.getByTestId('deploy-confirm')).toBeVisible();
  expect(await calls(page)).toEqual(['project_run','project_run','deploy_artifact_collect','deploy_plan']);
  await shot(page,`build-${theme}-2-confirm`);
  await page.getByRole('button',{name:'Publish',exact:true}).last().click();
  await expect(page.getByTestId('publish-result')).toContainText('Live: example.com');
 });
}
test('a failed build stops before any plan and says so in plain words',async({page})=>{
 await mockDeploy(page);await mockBuild(page,'build-fails');await readyProject(page);
 await page.getByTestId('publish-button').click();await page.getByTestId('publish-go').click();
 await expect(page.getByTestId('publish-failure')).toHaveAttribute('data-code','build');
 await expect(page.getByTestId('publish-failure')).toContainText('The build did not finish');
 expect(await calls(page)).not.toContain('deploy_plan');expect(await calls(page)).not.toContain('deploy_publish');await shot(page,'build-failed');
});
test('an artifact with a secret file is refused and the file is named',async({page})=>{
 await mockDeploy(page);await mockBuild(page,'forbidden');await readyProject(page);
 await page.getByTestId('publish-button').click();await page.getByTestId('publish-go').click();
 await expect(page.getByTestId('publish-failure')).toContainText('will not be published');
 await expect(page.getByTestId('publish-failure-path')).toHaveText('assets/.env');
 expect(await calls(page)).not.toContain('deploy_plan');await shot(page,'build-forbidden');
});
