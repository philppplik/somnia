import {test,expect} from './fixtures';
// CI-only (needs the Tauri/Vite app in a browser). Not run in the authoring sandbox.
test('animation export: current frame as SVG downloads a standalone .svg',async({page})=>{
 await page.goto('/');
 await page.evaluate(async()=>{const {requestStudio}=await import('/src/store/appStore.ts');requestStudio('animation');});
 await page.getByTestId('animation-create-blank').click();
 await expect(page.getByTestId('animation-workspace')).toBeVisible();
 await page.getByTestId('animation-add-shape').click();
 await page.getByRole('button',{name:'Render…'}).click();
 const download=page.waitForEvent('download');await page.getByTestId('animation-export-frame-svg').click();
 expect((await download).suggestedFilename()).toMatch(/_\d{5}\.svg$/);
});
