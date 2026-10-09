import {test,expect} from './fixtures';

test('Code mode is remembered per tab and studio; menus and shortcuts agree',async({page})=>{
 await page.goto('/');
 await page.evaluate(async()=>{
  const {patchState}=await import('/src/store/appStore.ts');
  patchState({activeStudio:'code',activeFile:'mode-a.html',studioByTab:{},studioModeByDocument:{},viewMode:'split'});
 });
 await page.getByRole('button',{name:'View',exact:true}).click();
 await expect(page.getByRole('menuitemradio',{name:/Split view/})).toHaveAttribute('aria-checked','true');
 await page.keyboard.press('Escape');
 await page.evaluate(async()=>{const {patchState}=await import('/src/store/appStore.ts');patchState({activeFile:'mode-b.html'});});
 await page.keyboard.press('Control+Alt+3');
 await page.evaluate(async()=>{const {patchState}=await import('/src/store/appStore.ts');patchState({activeFile:'mode-a.html'});});
 await page.getByRole('button',{name:'View',exact:true}).click();
 await expect(page.getByRole('menuitemradio',{name:/Split view/})).toHaveAttribute('aria-checked','true');
 await page.keyboard.press('Escape');
 const result=await page.evaluate(async()=>{
  const {getState,requestStudio}=await import('/src/store/appStore.ts');const before=getState();
  requestStudio('video');const {executeCommand}=await import('/src/lib/commands.ts');const accepted=await executeCommand('view.code');
  const away=getState().viewMode;requestStudio('code');const after=getState();
  return {accepted,away,restored:after.viewMode,files:before.files===after.files,revision:before.revision===after.revision,dirty:before.isDirty===after.isDirty,agent:before.agentOpen===after.agentOpen};
 });
 expect(result).toEqual({accepted:false,away:'split',restored:'split',files:true,revision:true,dirty:true,agent:true});
});
test('Studios without implemented modes do not advertise mode radio items',async({page})=>{
 await page.goto('/');
 await page.evaluate(async()=>{const {requestStudio}=await import('/src/store/appStore.ts');requestStudio('video');});
 await page.getByRole('button',{name:'View',exact:true}).click();
 await expect(page.getByRole('menuitemradio')).toHaveCount(0);
});
