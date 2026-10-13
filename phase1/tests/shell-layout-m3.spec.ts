import {test,expect} from './fixtures';
import {mkdirSync} from 'node:fs';
test.use({sample:false});
for(const theme of ['light','dark'] as const)test(`M3 shell ${theme}: panel stack and studio persistence`,async({page})=>{
 await page.goto('/');
 await page.evaluate(async theme=>{const {patchState,connectEditorProject}=await import('/src/store/appStore.ts');const {EditorProject}=await import('/packages/editor-core/src/index.ts');connectEditorProject(new EditorProject({'index.html':'<!doctype html><html><body><h1>Studio shell</h1><p>Local-first creative workspace.</p></body></html>'}),{name:'Shell verification',alreadySaved:true});patchState({themeChoice:theme,theme,notice:''});},theme);
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(500);mkdirSync('test-results/m3',{recursive:true});await page.screenshot({animations:'disabled',path:`test-results/m3/code-${theme}.png`});
 // Rail clicks replace the panel in studios without declared panels (Code); the stack is driven through the layout store here.
 await page.evaluate(async()=>{const {shellLayoutStore}=await import('/src/store/shellLayoutStore.ts');const {CODE_PANELS,CODE_LAYOUT}=await import('/src/lib/shell/codePanels.ts');shellLayoutStore.update('code',{leftPanels:['layers','files'],activeLeft:'files'},CODE_LAYOUT,CODE_PANELS);});
 await expect(page.getByLabel('left panel stack')).toBeVisible();
 await page.getByRole('button',{name:'Layers',exact:true}).click();await expect(page.getByRole('button',{name:'Layers',exact:true})).toHaveAttribute('aria-expanded','false');
 await page.getByRole('button',{name:'Move Files up',exact:true}).click();
 await page.evaluate(async()=>{const {patchState,requestStudio}=await import('/src/store/appStore.ts');patchState({sidebarWidth:350,inspectorOpen:false});requestStudio('photos');patchState({sidebarWidth:230,inspectorOpen:true});requestStudio('code');});
 expect(await page.evaluate(async()=>{const {getState}=await import('/src/store/appStore.ts');return [getState().sidebarWidth,getState().inspectorOpen];})).toEqual([350,false]);
 await page.evaluate(async()=>{const {requestStudio}=await import('/src/store/appStore.ts');requestStudio('photos');});
 expect(await page.evaluate(async()=>{const {getState}=await import('/src/store/appStore.ts');return [getState().sidebarWidth,getState().inspectorOpen];})).toEqual([230,true]);
 await page.evaluate(async()=>{const {requestStudio}=await import('/src/store/appStore.ts');requestStudio('code');});
 await page.screenshot({animations:'disabled',path:`test-results/m3/stack-${theme}.png`});await page.reload();
 expect(await page.evaluate(async()=>{const {getState}=await import('/src/store/appStore.ts');return [getState().sidebarWidth,getState().inspectorOpen];})).toEqual([350,false]);
 // Studios without declared panels do not restore the panel stack across reloads (single-panel Code compatibility); only width and visibility persist.
});
