import {test,expect} from './fixtures';
import {mkdirSync} from 'node:fs';
const SHOTS=process.env.PUBLISH_SHOTS??'';
if(SHOTS)mkdirSync(SHOTS,{recursive:true});

/** In-page fake of the Rust deploy service: same command names and error strings as src-tauri/src/deploy_commands.rs. */
async function mockDeploy(page:import('@playwright/test').Page){
 await page.addInitScript(()=>{
  const w=window as any;w.isTauri=true;let next=0;const callbacks=new Map<number,any>();const handlers=new Map<string,number>();w.ipcCalls=[];
  const FP='SHA256:Qm7xK2pLr9WvNcT4yHs8DfGa1BjEoZu5XiMq0RtVk4A';
  const st:any={targets:[],keys:{},pins:{},releases:['20261010T101500Z-a1b2c3','20261012T143015Z-d4e5f6'],fail:null as null|string,hold:null as null|Promise<void>,release:null as null|(()=>void)};
  w.__deploy=st;
  const emit=(event:string,payload:any)=>{const id=handlers.get(event);if(id)callbacks.get(id)?.({event,id,payload});};
  w.__emit=emit;
  const err=(c:string)=>{throw `deploy:${c}`;};
  const status=(t:any)=>({target:t,state:!st.keys[t.id]?'key-missing':st.pins[t.id]?'ready':'needs-trust',...(st.pins[t.id]?{fingerprint:st.pins[t.id]}:{})});
  const files=[{path:'index.html',size:4210,sha256:'a'.repeat(64),change:'changed'},{path:'css/site.css',size:9120,sha256:'b'.repeat(64),change:'changed'},{path:'img/hero.webp',size:182000,sha256:'c'.repeat(64),change:'added'},{path:'old/legacy.js',size:800,sha256:'d'.repeat(64),change:'removed'},{path:'about.html',size:2100,sha256:'e'.repeat(64),change:'unchanged'}];
  const plan=(id:string,action:string,rel?:string)=>({planHash:'9'.repeat(64),action,targetId:id,fingerprint:st.pins[id]??FP,buildId:'build-1',liveRelease:'20261012T143015Z-d4e5f6',releaseId:rel??null,files:action==='publish'?files:[]});
  w.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:(fn:any)=>{callbacks.set(++next,fn);return next;},invoke:async(cmd:string,args:any)=>{
   w.ipcCalls.push({cmd,args});
   if(cmd==='plugin:event|listen'){handlers.set(args.event,args.handler);return next;}
   if(cmd==='plugin:event|unlisten')return null;
   if(!cmd.startsWith('deploy_')){if(cmd==='list_files'||cmd==='recovery_list')return [];return null;}
   if(st.fail&&['deploy_publish','deploy_plan','deploy_hostkey_probe'].includes(cmd)){const c=st.fail;st.fail=null;err(c);}
   switch(cmd){
    case 'deploy_targets_list':return st.targets.map(status);
    case 'deploy_target_save':{const i=st.targets.findIndex((t:any)=>t.id===args.target.id);if(i>=0)st.targets[i]=args.target;else st.targets.push(args.target);return null;}
    case 'deploy_target_delete':st.targets=st.targets.filter((t:any)=>t.id!==args.targetId);return null;
    case 'deploy_key_create':if(st.keys[args.targetId])err('key-exists');st.keys[args.targetId]=true;return 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPq8mXk2Lw7vC0n3RtYhJbU4sDfGa1BjEoZu5XiMq0Rt somnia@my-laptop';
    case 'deploy_hostkey_probe':return {algorithm:'ssh-ed25519',fingerprint:FP};
    case 'deploy_hostkey_trust':st.pins[args.targetId]=args.fingerprint;return null;
    case 'deploy_hostkey_replace':st.pins[args.targetId]=args.newFingerprint;return null;
    case 'deploy_plan':return plan(args.targetId,'publish');
    case 'deploy_plan_rollback':return plan(args.targetId,'rollback',args.releaseId);
    case 'deploy_confirm_issue':return 'tok-'+args.planHash.slice(0,6);
    case 'deploy_releases':return st.releases;
    case 'deploy_open_site':return null;
    case 'deploy_publish':{emit('deploy-progress',{targetId:args.targetId,step:'connect'});emit('deploy-progress',{targetId:args.targetId,step:'check'});emit('deploy-progress',{targetId:args.targetId,step:'upload:7/12'});if(st.hold)await st.hold;const rel='20261013T113000Z-f7a8b9';st.releases.push(rel);return {releaseId:rel,url:'https://example.com',rolledBack:false};}
    case 'deploy_rollback':return {releaseId:args.releaseId,url:'https://example.com',rolledBack:true};
   }
   return null;}};
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
  await expect(page.getByTestId('publish-detail')).toHaveAttribute('data-state','key-missing');await shot(page,`${theme}-2-needs-key`);
  await page.getByRole('button',{name:'Create key'}).click();
  await expect(page.getByTestId('publish-detail')).toHaveAttribute('data-state','needs-trust');
  await expect(page.getByTestId('publish-key')).toContainText('ssh-ed25519 AAAAC3');await shot(page,`${theme}-3-key-created`);
  await page.getByRole('button',{name:'Check server'}).click();
  await expect(page.getByTestId('deploy-hostkey')).toBeVisible();
  await expect(page.getByTestId('deploy-fingerprint')).toContainText('SHA256:Qm7xK2pLr9');await shot(page,`${theme}-4-hostkey`);
  await page.getByRole('button',{name:'Trust and continue'}).click();
  await expect(page.getByTestId('publish-detail')).toHaveAttribute('data-state','ready');
  await expect(page.getByTestId('publish-pinned')).toBeVisible();await shot(page,`${theme}-5-ready`);
  // hold the upload so the progress view can be captured
  await page.evaluate(()=>{const s=(window as any).__deploy;s.hold=new Promise<void>(r=>{s.release=r;});});
  await page.getByTestId('publish-go').click();
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
  await expect(page.locator('.publish-release')).toHaveCount(3);await shot(page,`${theme}-9-rollback-list`);
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
