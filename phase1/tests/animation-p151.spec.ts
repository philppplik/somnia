import {test,expect} from './fixtures';
// CI-only (needs the Tauri/Vite app in a browser). Not run in the authoring sandbox.
test('animation timeline: Ctrl/Cmd+D duplicates the selected layer, undo restores',async({page})=>{
 await page.goto('/');
 await page.evaluate(async()=>{const {requestStudio}=await import('/src/store/appStore.ts');requestStudio('animation');});
 await page.getByTestId('animation-create-blank').click();
 await expect(page.getByTestId('animation-workspace')).toBeVisible();
 await page.getByTestId('animation-add-shape').click();
 const rows=page.locator('[data-testid^="animation-layer-drag-"]');
 await expect(rows).toHaveCount(1);
 await page.getByTestId('animation-timeline').focus();
 await page.keyboard.press('ControlOrMeta+d');
 await expect(rows).toHaveCount(2);
 await page.getByTestId('animation-timeline').getByLabel('Undo').click();
 await expect(rows).toHaveCount(1);
});
