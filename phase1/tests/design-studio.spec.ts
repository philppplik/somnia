import {test,expect} from '@playwright/test';
test('design blank / editable layers / undo / native reopen / SVG export / drag / panels',async({page})=>{
 await page.goto('/');await page.getByRole('radio',{name:'Design',exact:true}).click();await page.getByTestId('design-create-blank').click();await page.getByTestId('design-add-rectangle').click();const row=page.getByTestId('design-layer-name').first();await row.dblclick();await page.getByTestId('design-layer-name-input').fill('Card');await page.getByTestId('design-layer-name-input').press('Enter');
 await page.getByTestId('design-add-text').click();await page.getByTestId('design-field-text').fill('Grüße 世界\nMade in Somnia');await page.getByTestId('design-field-text').blur();await page.getByTestId('design-field-x').fill('100');await page.getByTestId('design-field-x').press('Enter');
 await page.screenshot({path:'test-results/design-layout-dark.png',fullPage:true});
 await page.getByTestId('design-undo').click();await expect(page.getByTestId('design-inspector-empty')).toBeVisible();await page.getByTestId('design-redo').click();
 const download=page.waitForEvent('download');await page.getByTestId('design-export-project').click();const project=await download;await project.saveAs('test-results/design-test.somdesign');
 page.on('dialog',dialog=>dialog.accept());await page.getByTestId('design-import-input').setInputFiles('test-results/design-test.somdesign');await expect(page.getByTestId('design-layer-name').filter({hasText:'Card'})).toBeVisible();
 const svgDownload=page.waitForEvent('download');await page.getByTestId('design-export-svg').click();const svg=await svgDownload;await svg.saveAs('test-results/design-test.svg');
 await page.getByTestId('design-layer-name').filter({hasText:'Text'}).click();const layer=page.getByTestId('design-artboard').getByRole('button',{name:'Text',exact:true});const bounds=await layer.boundingBox();if(!bounds)throw Error('No layer');await page.mouse.move(bounds.x+20,bounds.y+20);await page.mouse.down();await page.mouse.move(bounds.x+85,bounds.y+52);await page.mouse.up();await expect(page.getByTestId('design-field-x')).toHaveValue('200');
 await page.getByTestId('design-field-opacity').fill('40');await page.getByTestId('design-field-opacity').press('Enter');await expect(layer).toHaveCSS('opacity','0.4');
 await page.getByTestId('design-field-width').fill('nonsense');await page.getByTestId('design-field-width').press('Enter');await expect(page.getByTestId('design-field-width-error')).toBeVisible();await page.getByTestId('design-field-width').press('Escape');
 await page.getByTestId('design-layer-name').filter({hasText:'Card'}).click({modifiers:['Shift']});await expect(page.getByTestId('design-section-align')).toBeVisible();await page.getByTestId('design-align-left').click();
 await page.getByTestId('design-tool-frame').click();await expect(page.getByLabel('Active artboard')).toHaveValue(/.+/);await expect(page.getByTestId('design-layers-empty')).toBeVisible();
 await page.getByTestId('design-tool-rectangle').click();await page.getByTestId('design-artboard').click({position:{x:100,y:100}});await expect(page.getByTestId('design-layer-row')).toHaveCount(1);
 await page.screenshot({path:'test-results/design-layout-panels.png',fullPage:true});
});
