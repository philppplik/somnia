import {test,expect} from './fixtures';
// Explain, version-to-version Compare and the Safety browser over a mocked Tauri IPC (no real Git). Screenshots go to $SOMNIA_SHOTS.
const shotDir=process.env.SOMNIA_SHOTS;
test('explain, compare between versions, safety browser',async({page})=>{
 await page.addInitScript(()=>{
  const w=window as any;w.isTauri=true;let next=0;w.ipcCalls=[];
  const H=(c:string)=>c.repeat(40);
  const repo={root:'/p',projectPrefix:'',branch:'main',detached:false,unborn:false,head:H('b'),upstream:null,ahead:0,behind:0,hasLfs:false,hasSubmodules:false,gitVersion:'2.43.0'};
  const v=(c:string,s:string,t:number)=>({sha:H(c),subject:s,body:'',authorName:'Philipp',time:t,parents:[],changedFiles:2});
  const css='h1{color:#222;font:700 32px sans-serif}';
  const blobs:Record<string,string>={[H('1')]:'<link rel="stylesheet" href="style.css"><h1>Original</h1>',[H('2')]:'<link rel="stylesheet" href="style.css"><h1>Hero rewritten</h1>',[H('3')]:css};
  const entries=(i:string)=>[{path:'index.html',blob:H(i),sizeBytes:60,binary:false},{path:'style.css',blob:H('3'),sizeBytes:css.length,binary:false},{path:'logo.png',blob:H('4'),sizeBytes:900,binary:true}];
  const side=(r:string)=>({ref:r,sha:r,tree:r==H('b')?H('7'):H('8')});
  w.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>++next,invoke:async(cmd:string,args:any)=>{
   w.ipcCalls.push({cmd,args});if(cmd==='plugin:event|listen')return ++next;if(cmd==='choose_project')return {projectId:'p1',name:'Demo'};
   if(cmd==='list_files')return ['index.html'];if(cmd==='recovery_list'||cmd==='recovery_history_list')return [];
   if(cmd==='read_file')return {content:'x',revision:{exists:true,hash:'base'},status:{}};
   if(cmd==='git_detect')return {kind:'ready',repo};
   if(cmd==='git_status')return {repo,changes:[],stateToken:'t1',truncated:false};
   if(cmd==='git_log')return [v('b','Hero section rewritten',1760000000),v('a','First version',1759000000)];
   if(cmd==='git_diff_refs'){const r=args.request;return {from:side(r.from),to:side(r.to),truncated:false,files:[
    {path:'index.html',kind:'modified',binary:false,beforeBlob:H('1'),afterBlob:H('2'),patch:'@@ -1 +1 @@\n-<h1>Original</h1>\n+<h1>Hero rewritten</h1>'},
    {path:'sections/team.html',kind:'added',binary:false,beforeBlob:null,afterBlob:H('3')},
    {path:'logo.png',kind:'modified',binary:true,beforeBlob:H('4'),afterBlob:H('5')}]};}
   if(cmd==='git_ref_tree')return {side:side(args.gitRef),entries:entries(args.gitRef===H('b')?'2':'1'),truncated:false};
   if(cmd==='git_read_blob')return {blob:args.blob,binary:false,tooLarge:false,sizeBytes:10,text:blobs[args.blob]??''};
   if(cmd==='git_safety_list')return [{ref:'refs/somnia/safety/1760000100',sha:H('c'),time:1760000100,scope:[],operation:'restore',subject:'Somnia safety copy 1760000100'},{ref:'refs/somnia/safety/1759500000',sha:H('d'),time:1759500000,scope:['index.html'],operation:'combine',subject:'Somnia safety copy 1759500000'}];
   return null;
  }};w.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
 });
 const shot=async(n:string)=>{if(shotDir)await page.screenshot({path:`${shotDir}/${n}`});};
 page.on('dialog',d=>d.accept());await page.goto('/');
 await expect(async()=>{await page.keyboard.press('Control+o');await expect(page.locator('[data-storage]')).toHaveAttribute('data-storage','disk',{timeout:5000});}).toPass({timeout:60000});
 await page.evaluate(async()=>{const m=await import('/src/store/appStore.ts');m.patchState({leftTab:'versions'});});
 if(process.env.SOMNIA_DARK)await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));const panel=page.getByTestId('versions-panel');await expect(panel).toBeVisible();
 // Explain
 await panel.getByRole('tab',{name:'Explain'}).click();await page.getByTestId('explain-run').click();
 await expect(page.getByTestId('explain-result')).toContainText('3 files changed: 1 added, 2 edited');await shot('e1-explain.png');
 // Compare between versions
 await panel.getByRole('tab',{name:'Compare'}).click();await page.getByTestId('compare-mode-versions').click();await page.getByTestId('refcompare-run').click();
 await expect(page.getByTestId('refcompare-evidence')).toBeVisible();await expect(page.getByTestId('hash-before')).toContainText(/[0-9a-f]{12}/);await page.waitForTimeout(600);await shot('e2-compare.png');
 // Safety
 await panel.getByRole('tab',{name:'History'}).click();await expect(page.getByTestId('versions-safety')).toContainText('Before a restore');
 await page.getByTestId('versions-safety').scrollIntoViewIfNeeded();await shot('e3-safety.png');
 await page.getByRole('button',{name:'Restore as new version'}).first().click();await page.waitForTimeout(400);await shot('e4-safety-confirm.png');
 const calls=await page.evaluate(()=>(window as any).ipcCalls.map((c:any)=>c.cmd));
 for(const c of ['git_diff_refs','git_ref_tree','git_read_blob','git_safety_list'])expect(calls).toContain(c);
 expect(calls).not.toContain('git_restore_as_new_version');
});
