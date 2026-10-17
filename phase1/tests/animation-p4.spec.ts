import {test,expect} from './fixtures';
/** CI-only full app. Local real-component and raster checks are separate. */
test('P4 shape trace, keyed bypass and bounded sequence',async({page})=>{
 await page.goto('/');await page.evaluate(async()=>{const {requestStudio}=await import('/src/store/appStore.ts');requestStudio('animation');});await page.getByTestId('animation-create-blank').click();await page.getByTestId('animation-add-shape').click();
 await page.getByRole('combobox',{name:'Shape',exact:true}).selectOption('path');await page.getByRole('button',{name:'Trace outline',exact:true}).click();await page.getByRole('button',{name:'Tint +',exact:true}).click();await page.getByRole('button',{name:'Add tint colour key',exact:true}).click();await page.getByTestId('animation-timeline').getByLabel('Next frame').click();await page.getByLabel('Bypass at playhead (hold key)',{exact:true}).check();
 await page.getByRole('button',{name:'Render…'}).click();const download=page.waitForEvent('download');await page.getByTestId('animation-export-sequence').click();expect((await download).suggestedFilename()).toMatch(/_frames\.zip$/);await expect(page.getByTestId('animation-export-done')).toBeVisible();
});
