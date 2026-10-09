import {test,expect} from './fixtures';
async function mock(page:any,initial:string|null){
 await page.addInitScript((initial:string|null)=>{
  const w=window as any;w.isTauri=true;let next=0;w.ipcCalls=[];w.settingsFile=initial;
  w.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>++next,invoke:async(cmd:string,args:any)=>{w.ipcCalls.push({cmd,args});
   if(cmd==='plugin:event|listen')return ++next;
   if(cmd==='choose_project')return {projectId:'p1',name:'Scoped folder'};
   if(cmd==='list_files')return ['index.html'];
   if(cmd==='read_file')return {content:'<!doctype html><html><body><h1>Native title</h1></body></html>',revision:{exists:true,hash:'disk'},status:{}};
   if(cmd==='read_project_settings')return w.settingsFile;
   if(cmd==='write_project_settings'){w.settingsFile=args.content;return null;}
   if(cmd==='recovery_list')return [];
   return null;}};
  w.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
 },initial);
}
test('project override toggle writes .somnia/settings.json and leaves user prefs alone',async({page})=>{
 await mock(page,null);
 page.on('dialog',d=>d.accept());
 await page.goto('/');await expect(page.getByRole('radio',{name:'Somnia Code',exact:true})).toBeVisible();
 await page.keyboard.press('Control+o');await expect(page.getByText('Scoped folder',{exact:true})).toBeVisible();
 await page.keyboard.press('Control+,');const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Editing',exact:true}).click();
 const toggle=dialog.getByLabel('Only for this project: Units and paper');await expect(toggle).not.toBeChecked();
 await toggle.check();
 await expect.poll(()=>page.evaluate(()=>(window as any).settingsFile)).toContain('"workflow.units"');
 await dialog.getByLabel('Units and paper',{exact:true}).selectOption('imperial');
 await expect.poll(()=>page.evaluate(()=>JSON.parse((window as any).settingsFile).settings['workflow.units'])).toBe('imperial');
 const user=await page.evaluate(()=>Object.entries(localStorage).filter(([k])=>/workflow/i.test(k)).map(([,v])=>v).join('|'));
 expect(user).not.toContain('imperial');
 await toggle.uncheck();
 await expect.poll(()=>page.evaluate(()=>JSON.parse((window as any).settingsFile).settings['workflow.units']??null)).toBe(null);
});
test('existing project file is read on connect and shown as overridden',async({page})=>{
 await mock(page,JSON.stringify({version:1,settings:{'workflow.imageSaveMode':'copy','ai.key':'x'}}));
 page.on('dialog',d=>d.accept());
 await page.goto('/');await expect(page.getByRole('radio',{name:'Somnia Code',exact:true})).toBeVisible();
 await page.keyboard.press('Control+o');await expect(page.getByText('Scoped folder',{exact:true})).toBeVisible();
 await page.keyboard.press('Control+,');const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Editing',exact:true}).click();
 await expect(dialog.getByLabel('Only for this project: Saving edited images')).toBeChecked();
 await expect(dialog.getByLabel('Saving edited images',{exact:true})).toHaveValue('copy');
 await expect(dialog.getByLabel('Only for this project: Units and paper')).not.toBeChecked();
});
