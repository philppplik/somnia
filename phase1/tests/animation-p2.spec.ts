import {test,expect} from './fixtures';
/** CI-only full-app test: requires native/WASM build prerequisites. Isolated screenshots are not a substitute. */
test('Animation P2 creates text and shapes, imports a bounded SVG, exposes speed graph and exports PNG',async({page})=>{
 await page.goto('/');
 await page.evaluate(async()=>{const {requestStudio}=await import('/src/store/appStore.ts');requestStudio('animation');});
 await page.getByTestId('animation-create-blank').click();
 await page.getByTestId('animation-add-text').click();
 await page.getByLabel('Text size',{exact:true}).fill('72');await page.getByLabel('Text size',{exact:true}).press('Enter');
 await page.getByLabel('Animate Position').check();
 await page.getByTestId('animation-timeline').getByLabel('Next frame').click();
 await page.getByLabel('Position X',{exact:true}).fill('500');await page.getByLabel('Position X',{exact:true}).press('Enter');
 await page.getByTestId('animation-graph-toggle').click();
 await page.getByTestId('animation-graph-mode-speed').click();await expect(page.getByTestId('animation-graph-curve')).toBeVisible();
 await page.getByTestId('animation-graph-mode-value').click();
 await page.getByTestId('animation-graph-channel-1').click();
 await page.getByLabel('Path timing',{exact:true}).selectOption('arcLength');
 await page.getByRole('button',{name:'Blur +',exact:true}).click();
 await page.getByLabel('Amount',{exact:true}).fill('6');await page.getByLabel('Amount',{exact:true}).press('Enter');
 await page.getByTestId('animation-compositions-panel').getByLabel('Import image / SVG').setInputFiles({name:'original.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg width="100" height="100"><ellipse cx="50" cy="50" rx="40" ry="40" fill="#7c5cff"/></svg>')});
 await expect(page.getByTestId('animation-properties').getByLabel('Name',{exact:true})).toHaveValue('original.svg');
 await page.getByTestId('animation-compositions-panel').getByLabel('Import image / SVG').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg><script>bad()</script></svg>')});
 await expect(page.getByTestId('animation-compositions-panel').getByRole('alert')).toBeVisible();
 await expect(page.getByTestId('animation-properties').getByLabel('Name',{exact:true})).toHaveValue('original.svg');
 await page.getByRole('button',{name:'Render…'}).click();
 const download=page.waitForEvent('download');await page.getByTestId('animation-export-frame').click();expect((await download).suggestedFilename()).toMatch(/\.png$/);
});
