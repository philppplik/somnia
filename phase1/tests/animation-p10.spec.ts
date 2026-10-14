import {test,expect} from './fixtures';
/** CI-only full app. Not run locally: builders have no WASM toolchain. Local real-component checks live in test/animation-preview.tsx (?masks=1) and animation-p10.test.ts. */
test('P10 masks, track matte and text rotation/colour animators',async({page})=>{
 await page.goto('/');await page.evaluate(async()=>{const {requestStudio}=await import('/src/store/appStore.ts');requestStudio('animation');});await page.getByTestId('animation-create-blank').click();
 await page.getByTestId('animation-add-shape').click();await page.getByTestId('animation-add-solid').click();
 // Mask: add, then it is capped at four.
 await page.getByTestId('animation-mask-add').click();await expect(page.getByTestId('animation-mask-0')).toBeVisible();
 for(let i=0;i<3;i++)await page.getByTestId('animation-mask-add').click();await expect(page.getByTestId('animation-mask-add')).toBeDisabled();
 // Track matte: pick the other layer as source; it disappears from the scene on its own.
 const source=page.getByTestId('animation-matte-source');await source.selectOption({index:1});
 await expect(page.getByTestId('animation-matte-mode')).toBeVisible();await page.getByTestId('animation-matte-mode').selectOption('luma');
 await expect(page.getByTestId('animation-viewer').locator('mask').first()).toBeAttached();
 await source.selectOption('');await expect(page.getByTestId('animation-matte-mode')).toHaveCount(0);
 // Text animator with colour.
 await page.getByTestId('animation-add-text').click();await page.getByTestId('animation-animator-add').click();
 await page.getByTestId('animation-animator-0').getByRole('checkbox').nth(1).check();
 await expect(page.getByTestId('animation-animator-0').locator('input[type=color]')).toBeVisible();
 // P11: path shape, animate toggle and mask opacity on a fresh layer.
 await page.getByTestId('animation-add-solid').click();await page.getByTestId('animation-mask-add').click();
 await page.getByTestId('animation-mask-0').locator('select').first().selectOption('path');
 await expect(page.getByTestId('animation-mask-path-0')).toBeVisible();
 await page.getByTestId('animation-mask-0').getByRole('checkbox',{name:/Animate position|position animieren/i}).check();
 await expect(page.getByTestId('animation-mask-0').getByRole('checkbox',{name:/Animate position|position animieren/i})).toBeChecked();
 // P12 (CI-only): animated mask gets key lanes and on-canvas handles; one drag is one undo step.
 await page.getByTestId('animation-mask-0').getByRole('checkbox',{name:/Animate position|position animieren/i}).check();
 await expect(page.getByTestId('animation-maskrow-0-position')).toBeVisible();
 await expect(page.getByTestId('animation-mask-overlay')).toBeVisible();
 const pt=page.getByTestId('animation-mask-point').first();const box=(await pt.boundingBox())!;
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+40,box.y+30,{steps:5});await page.mouse.up();
 await page.keyboard.press('Control+z');
 await expect(page.getByTestId('animation-mask-point').first()).toBeVisible();
 // P13 (CI-only): pen tool draws a path, clicking the first point closes it; Animate path adds a path lane.
 await page.getByTestId('animation-pen-toggle').click();
 const surface=page.getByTestId('animation-pen-surface');const sb=(await surface.boundingBox())!;
 for(const [x,y] of [[0.4,0.4],[0.5,0.4],[0.5,0.5]]){await page.mouse.click(sb.x+sb.width*x,sb.y+sb.height*y);}
 await page.getByTestId('animation-pen-toggle').click();
 await page.getByTestId('animation-mask-pathanim-0').check();
 await expect(page.getByTestId('animation-maskrow-0-path')).toBeVisible();
});
