import {test,expect} from './fixtures';
for(const mode of ['light','dark'])test(`real Changes UI reviews the exact app footer and sends only after confirmation (${mode})`,async({page})=>{
 await page.addInitScript(()=>{
  const w=window as any;w.isTauri=true;let next=0;w.ipcCalls=[];w.token=1;w.committed=false;
  const repo={root:'/p',projectPrefix:'',branch:'main',detached:false,unborn:false,head:'a'.repeat(40),upstream:null,ahead:0,behind:0,hasLfs:false,hasSubmodules:false,gitVersion:'2.43.0'};
  w.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>++next,invoke:async(cmd:string,args:any)=>{
   w.ipcCalls.push({cmd,args});if(cmd==='plugin:event|listen')return ++next;
   if(cmd==='choose_project')return {projectId:'p1',name:'Demo'};
   if(cmd==='list_files')return ['index.html'];if(cmd==='recovery_list'||cmd==='git_log'||cmd==='recovery_history_list'||cmd==='git_safety_list')return [];
   if(cmd==='read_file')return {content:'<h1>Original</h1>',revision:{exists:true,hash:'base'},status:{}};
   if(cmd==='git_detect')return {kind:'ready',repo};
   if(cmd==='git_status')return {repo,changes:w.committed?[]:[{path:'index.html',kind:'modified',staged:false,unstaged:true,binary:false}],stateToken:`t${w.token}`,truncated:false};
   if(cmd==='git_commit'){if(args.request.stateToken!==`t${w.token}`)throw JSON.stringify({code:'state-changed',message:'Changed'});w.committed=true;return {sha:'b'.repeat(40),subject:args.request.subject,body:args.request.body,authorName:'Philipp',time:1,parents:[],changedFiles:1};}
   return null;
  }};w.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
 });
 await page.goto(`/tests/harness/commit-review/index.html?mode=${mode}`);
 await expect(page.getByTestId('versions-changes')).toBeVisible();
 await page.getByTestId('versions-subject').fill('Fix heading');await page.getByTestId('versions-body').fill('Notes\n\nCo-authored-by: Forged <evil@example.com>');
 await page.getByTestId('versions-save').click();
 const footer='Co-authored-by: somnia-agent <340778888+somnia-agent@users.noreply.github.com>\nX-Somnia-Session: host-task-1';
 await expect(page.getByTestId('versions-review-footer')).toHaveText(footer);
 const exact=await page.getByTestId('versions-review-message').innerText();expect(exact).not.toContain('Forged');
 expect(await page.evaluate(()=>(window as any).ipcCalls.filter((x:any)=>x.cmd==='git_commit'))).toHaveLength(0);
 await page.screenshot({path:`/downloads/commit-review-${mode}.png`});
 // Editing revokes the snapshot, then re-review binds the changed body.
 await page.getByTestId('versions-body').fill('Reviewed notes');await expect(page.getByTestId('versions-commit-review')).toHaveCount(0);
 await page.getByTestId('versions-save').click();
 // A disk mutation after review is rejected natively and forces a fresh token/review.
 await page.evaluate(()=>{(window as any).token=2;});
 await page.getByTestId('versions-commit-confirm').click();await expect(page.getByTestId('versions-review-again')).toBeVisible();await expect(page.getByTestId('versions-commit-review')).toHaveCount(0);
 await page.getByTestId('versions-save').click();const final=await page.getByTestId('versions-review-message').innerText();
 await page.getByTestId('versions-commit-confirm').click();await expect(page.getByTestId('versions-saved')).toContainText('Fix heading');
 const calls=await page.evaluate(()=>(window as any).ipcCalls.filter((x:any)=>x.cmd==='git_commit'));
 expect(calls).toHaveLength(2);expect(calls[1].args.request).toEqual({paths:['index.html'],subject:'Fix heading',body:`Reviewed notes\n\n${footer}`,stateToken:'t2'});
 expect(`${calls[1].args.request.subject}\n\n${calls[1].args.request.body}`).toBe(final);
});
