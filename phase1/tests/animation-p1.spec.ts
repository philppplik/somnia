import {test,expect} from './fixtures';
// CI-only (needs the Tauri/Vite app in a browser). Not run in the authoring sandbox, where the same flows
// were driven against an isolated harness with a real Chrome (marquee, multi-key drag, clipboard, work area, loop, graph handles, PNG and ZIP download).
test('animation studio P1: select keys, copy and paste, work area, graph, export',async({page})=>{
 await page.goto('/');
 await page.evaluate(async()=>{const {requestStudio}=await import('/src/store/appStore.ts');requestStudio('animation');});
 await page.getByTestId('animation-create-blank').click();
 await page.getByTestId('animation-add-shape').click();
 await page.getByLabel('Animate Position').check();
 await page.getByTestId('animation-timeline').getByLabel('Next frame').click();
 await page.getByLabel('Position X').fill('500');await page.getByLabel('Position X').press('Enter');
 const keys=page.getByTestId('animation-keyrow-position').locator('button[data-key-prop]');
 await expect(keys).toHaveCount(2);
 await keys.first().click();await keys.nth(1).click({modifiers:['Shift']});
 await expect(keys.first()).toHaveAttribute('aria-pressed','true');await expect(keys.nth(1)).toHaveAttribute('aria-pressed','true');
 await page.getByTestId('animation-timeline').press('Control+c');
 await page.getByTestId('animation-timeline').getByLabel('Next frame').click();
 await page.getByTestId('animation-timeline').press('Control+v');
 await expect(keys).toHaveCount(3);
 await page.getByTestId('animation-timeline').press('Delete');
 await expect(keys).toHaveCount(2);
 await page.getByTestId('animation-wa-in').click();
 await expect(page.getByTestId('animation-wa-label')).toContainText('00:00:00:02');
 await page.getByTestId('animation-graph-toggle').click();
 await expect(page.getByTestId('animation-graph-svg')).toBeVisible();
 await page.getByRole('button',{name:'Render…'}).click();
 const download=page.waitForEvent('download');
 await page.getByTestId('animation-export-frame').click();
 expect((await download).suggestedFilename()).toMatch(/\.png$/);
});
