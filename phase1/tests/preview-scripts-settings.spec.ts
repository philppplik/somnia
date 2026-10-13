import {test,expect} from './fixtures';

const source='<html><head></head><body><h1 id="result">authored</h1><script>document.getElementById("result").textContent="executed"</script></body></html>';
async function preview(page:import('@playwright/test').Page) {
 await page.goto('/');
 await page.evaluate(async html=>{const {patchState}=await import('/src/store/appStore.ts');(window as any).__somnia.setSource('index.html',html);patchState({livePreview:true});},source);
 return page.frameLocator('iframe[title="Live preview frame"]');
}
async function settings(page:import('@playwright/test').Page) {
 await page.keyboard.press('Control+,');
 await page.getByRole('button',{name:'Preview',exact:true}).click();
 return page.getByRole('checkbox',{name:'Run page scripts in live preview'});
}
test('missing old setting migrates on; global opt-out persists, updates live and never asks',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('somnia.previewPrefs.v1','{"legacy":true}'));
 const frame=await preview(page);
 await expect(frame.locator('#result')).toHaveText('executed');
 await expect(page.getByText('Run scripts in the preview?',{exact:true})).toHaveCount(0);
 const toggle=await settings(page);
 await expect(toggle).toBeChecked();
 await toggle.uncheck();
 await expect(frame.locator('#result')).toHaveText('authored');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('somnia.previewPrefs.v1')!).previewScripts)).toBe(false);
 await page.keyboard.press('Escape');
 // Avoid resetting the migrated preference via the initialization script on reload.
 await page.evaluate(async()=>{const {patchState}=await import('/src/store/appStore.ts');patchState({livePreview:false});});
 await page.evaluate(async()=>{const {patchState}=await import('/src/store/appStore.ts');patchState({livePreview:true});});
 await expect(frame.locator('#result')).toHaveText('authored');
 await expect(page.getByText('Run scripts in the preview?',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Toggle preview scripts'}).click();
 await expect(frame.locator('#result')).toHaveText('executed');
});
for(const projectChoice of [false,true])test(`saved project override ${projectChoice} wins over opposite global setting`,async({page})=>{
 await page.addInitScript(({projectChoice})=>{
  localStorage.setItem('somnia.previewPrefs.v1',JSON.stringify({previewScripts:!projectChoice}));
 },{projectChoice});
 await page.goto('/');
 await page.evaluate(async({html,projectChoice})=>{
  const {getState,patchState}=await import('/src/store/appStore.ts');
  localStorage.setItem(`somnia.preview.scripts.${getState().projectName}`,projectChoice?'1':'0');
  (window as any).__somnia.setSource('index.html',html);patchState({livePreview:true});
 },{html:source,projectChoice});
 const frame=page.frameLocator('iframe[title="Live preview frame"]');
 await expect(frame.locator('#result')).toHaveText(projectChoice?'executed':'authored');
 const toggle=await settings(page);
 await toggle.setChecked(projectChoice);
 await toggle.setChecked(!projectChoice);
 await expect(frame.locator('#result')).toHaveText(projectChoice?'executed':'authored');
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Toggle preview scripts'}).click();
 await expect(frame.locator('#result')).toHaveText(projectChoice?'authored':'executed');
 await page.reload();
 await page.evaluate(async html=>{const {patchState}=await import('/src/store/appStore.ts');(window as any).__somnia.setSource('index.html',html);patchState({livePreview:true});},source);
 await expect(frame.locator('#result')).toHaveText(projectChoice?'authored':'executed');
});
test('global off survives app reload without creating a project decision',async({page})=>{
 const frame=await preview(page);
 await (await settings(page)).uncheck();
 await page.reload();
 await page.evaluate(async html=>{const {patchState}=await import('/src/store/appStore.ts');(window as any).__somnia.setSource('index.html',html);patchState({livePreview:true});},source);
 await expect(frame.locator('#result')).toHaveText('authored');
 expect(await page.evaluate(async()=>{const {getState}=await import('/src/store/appStore.ts');return localStorage.getItem(`somnia.preview.scripts.${getState().projectName}`);})).toBeNull();
});
