import {test,expect} from './fixtures';
// Full-stack UI check of the Versions panel against a mocked Tauri IPC (no real Git). Screenshots go to /tmp/shots.
const repo={root:'/p',projectPrefix:'',branch:'main',detached:false,unborn:false,head:'a'.repeat(40),upstream:null,ahead:0,behind:0,hasLfs:false,hasSubmodules:false,gitVersion:'2.43.0'};
const ver=(sha:string,subject:string,time:number)=>({sha:sha.repeat(40).slice(0,40),subject,body:'',authorName:'Philipp',time,parents:[],changedFiles:2});
const shotDir=process.env.SOMNIA_SHOTS;
test('versions panel: history, compare, trust, variants over mocked IPC',async({page})=>{
 await page.addInitScript(()=>{
  const w=window as any;w.isTauri=true;let next=0;w.ipcCalls=[];w.trusted=false;
  const html='<!doctype html><html><body><h1>Original</h1></body></html>';
  const repo={root:'/p',projectPrefix:'',branch:'main',detached:false,unborn:false,head:'a'.repeat(40),upstream:null,ahead:0,behind:0,hasLfs:false,hasSubmodules:false,gitVersion:'2.43.0'};
  const v=(c:string,s:string,t:number)=>({sha:c.repeat(40),subject:s,body:'',authorName:'Philipp',time:t,parents:[],changedFiles:2});
  w.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>++next,invoke:async(cmd:string,args:any)=>{
   w.ipcCalls.push({cmd,args});if(cmd==='plugin:event|listen')return ++next;if(cmd==='choose_project')return {projectId:'p1',name:'Demo'};
   if(cmd==='list_files')return ['index.html'];if(cmd==='recovery_list')return [];
   if(cmd==='read_file')return {content:html,revision:{exists:true,hash:'base'},status:{}};
   if(cmd==='git_detect')return w.trusted?{kind:'ready',repo}:{kind:'blocked',reason:'untrusted-repo',repo};
   if(cmd==='git_trust_repo'){w.trusted=true;return {kind:'ready',repo};}
   if(cmd==='git_status')return {repo,changes:[{path:'index.html',kind:'modified',staged:false,unstaged:true,binary:false}],stateToken:'t1',truncated:false};
   if(cmd==='git_log')return [v('b','Hero section rewritten',1760000000),v('c','First version',1759000000)];
   if(cmd==='git_diff_file')return {path:args.path,binary:false,base:args.base,target:args.target,before:html,after:html.replace('Original','Changed'),unified:'@@ -1 +1 @@\n-Original\n+Changed',tooLarge:false};
   if(cmd==='recovery_history_list')return [{id:'r1',kind:'recovery',record:{path:'index.html',content:html.replace('Original','Recovered'),clientRevision:1,updatedAtMs:1760000500000}}];
   if(cmd==='git_variant_list')return [{name:'main',current:true,head:'a'.repeat(40),subject:'Hero section rewritten',time:1760000000,aheadOfMain:0,merged:true}];
   if(cmd==='git_combine_status')return null;
   return null;
  }};w.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
 });
 const shot=async(n:string)=>{if(shotDir)await page.screenshot({path:`${shotDir}/${n}`});};
 page.on('dialog',d=>d.accept());await page.goto('/');
 // Loaded CI runners can swallow the first Ctrl+o while the app is still booting; retry the
 // shortcut (the mocked choose_project is idempotent) until the project is on disk.
 await expect(async()=>{await page.keyboard.press('Control+o');await expect(page.locator('[data-storage]')).toHaveAttribute('data-storage','disk',{timeout:5000});}).toPass({timeout:60000});
 await page.evaluate(async()=>{const m=await import('/src/store/appStore.ts');m.patchState({leftTab:'versions'});});
 const panel=page.getByTestId('versions-panel');await expect(panel).toBeVisible();
 // Trust dialog
 await expect(page.getByTestId('versions-trust')).toBeVisible();await shot('1-untrusted.png');
 await page.getByTestId('versions-trust').click();await shot('2-trust-dialog.png');
 await page.getByTestId('versions-trust-confirm').click();
 await expect(page.getByTestId('versions-changes')).toBeVisible();await shot('3-changes.png');
 // History
 await panel.getByRole('tab',{name:'History'}).click();await expect(panel.getByText('Hero section rewritten')).toBeVisible();await shot('4-history.png');
 // Compare
 await panel.getByRole('tab',{name:'Compare'}).click();await panel.getByRole('combobox').selectOption('index.html');await expect(page.getByTestId('versions-compare')).toBeVisible();await page.waitForTimeout(500);await shot('5-compare.png');
 // Variants
 await panel.getByRole('tab',{name:'Variants'}).click();await page.waitForTimeout(500);await shot('6-variants.png');
 const calls=await page.evaluate(()=>(window as any).ipcCalls.map((c:any)=>c.cmd));
 expect(calls).toContain('git_trust_repo');expect(calls).toContain('recovery_history_list');expect(calls).toContain('git_diff_file');expect(calls).toContain('git_variant_list');
});
