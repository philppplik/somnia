import {openPublish} from './helpers';
import {test,expect} from './fixtures';
import {mkdirSync} from 'node:fs';
const SHOTS=process.env.PUBLISH_SHOTS??'';
if(SHOTS)mkdirSync(SHOTS,{recursive:true});

/** In-page fake of the Rust node app-settings commands. Values are kept out of every result, as in Rust. */
async function mockNode(page:import('@playwright/test').Page){
 await page.addInitScript(()=>{
  const w=window as any;w.isTauri=true;let next=0;const callbacks=new Map<number,any>();w.ipcCalls=[];
  const target={id:'shop',name:'Shop',host:'203.0.113.10',port:22,user:'somnia',domain:'shop.example.com',kind:'node',keySlot:'deploy-key:shop',appPort:3000};
  const env=new Map<string,string>([['SESSION_SECRET','s3cr3t-value'],['PUBLIC_API_URL','https://api.example.com']]);
  w.__env=env;
  w.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:(fn:any)=>{callbacks.set(++next,fn);return next;},invoke:async(cmd:string,args:any)=>{
   w.ipcCalls.push({cmd,args});
   if(cmd==='plugin:event|listen')return next;
   if(cmd==='plugin:event|unlisten')return null;
   switch(cmd){
    case 'deploy_targets_list':return [{target,state:'ready',fingerprint:'SHA256:Qm7xK2pLr9WvNcT4yHs8DfGa1BjEoZu5XiMq0RtVk4A'}];
    case 'deploy_releases':return [];
    case 'deploy_live_release':return null;
    case 'deploy_node_env_keys':return [...env.keys()].sort();
    case 'deploy_node_env_apply':for(const k of args.remove)env.delete(k);for(const s of args.set)env.set(s.key,s.value);return [...env.keys()].sort();
    case 'deploy_node_status':return {active:'active',restarts:0,port:20417,current:'20261013',nodeVersion:'v22.11.0',lastHealth:{release:'20261013',status:'ok',at:1}};
    case 'deploy_node_logs':return ['Listening on http://127.0.0.1:20417','GET / 200 12ms','GET /api/items 200 31ms'];
   }
   if(cmd==='list_files'||cmd==='recovery_list')return [];
   return null;}};
  w.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
 });
}
const setTheme=(page:import('@playwright/test').Page,theme:'light'|'dark')=>page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);

for(const theme of ['light','dark'] as const){
 test(`node app settings: names only, values write-only (${theme})`,async({page})=>{
  await mockNode(page);await page.goto('/');await setTheme(page,theme);
  await openPublish(page);
  const box=page.getByTestId('node-settings');
  await expect(box).toBeVisible();
  await expect(page.getByTestId('node-env-keys')).toContainText('SESSION_SECRET');
  await expect(box).not.toContainText('s3cr3t-value');
  await expect(page.getByTestId('node-status')).toContainText('Running');
  await page.getByLabel('Variable name').fill('DATABASE_URL');
  await page.getByLabel('Value',{exact:true}).fill('postgres://u:pw@db/app');
  await page.getByRole('button',{name:'Save'}).click();
  await expect(page.getByTestId('node-env-keys')).toContainText('DATABASE_URL');
  await expect(box).not.toContainText('postgres://');
  await page.getByText('Recent log').click();
  await expect(page.getByTestId('node-logs')).toContainText('Listening on');
  if(SHOTS){await page.waitForTimeout(400);await page.screenshot({path:`${SHOTS}/node-${theme}.png`});}
  await page.getByLabel('Remove PUBLIC_API_URL').click();
  await expect(page.getByTestId('node-env-keys')).not.toContainText('PUBLIC_API_URL');
 });
}
