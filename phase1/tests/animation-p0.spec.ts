import {test,expect} from './fixtures';
// CI-only (needs the Tauri/Vite app in a browser). Not run in the authoring sandbox.
test('animation studio P0: blank composition, layer, keyframe, undo, recovery',async({page})=>{
 await page.goto('/');
 await page.evaluate(async()=>{const {requestStudio}=await import('/src/store/appStore.ts');requestStudio('animation');});
 await expect(page.getByTestId('animation-start')).toBeVisible();
 await page.getByTestId('animation-create-blank').click();
 await expect(page.getByTestId('animation-workspace')).toBeVisible();
 await page.getByTestId('animation-add-shape').click();
 await expect(page.getByTestId('animation-viewer').locator('g[data-layer]')).toHaveCount(1);
 await page.getByLabel('Animate Opacity').check();
 await page.getByTestId('animation-timeline').getByLabel('Next frame').click();
 await page.getByLabel('Opacity',{exact:true}).fill('20');await page.getByLabel('Opacity',{exact:true}).press('Enter');
 await expect(page.getByTestId('animation-keyrow-opacity').getByRole('button')).toHaveCount(2);
 await page.getByTestId('animation-timeline').getByLabel('Undo').click();
 await expect(page.getByTestId('animation-keyrow-opacity').getByRole('button')).toHaveCount(1);
 await expect(page.getByRole('button',{name:'Render…'})).toBeVisible();
 await page.getByRole('button',{name:'Render…'}).click();
 await expect(page.getByTestId('animation-render-setup')).toBeVisible();
 await page.reload();
 await page.evaluate(async()=>{const {requestStudio}=await import('/src/store/appStore.ts');requestStudio('animation');});
 await page.getByTestId('animation-open').click();
 await expect(page.getByTestId('animation-workspace')).toBeVisible();
});
