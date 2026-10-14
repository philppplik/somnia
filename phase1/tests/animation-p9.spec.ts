import {test,expect} from './fixtures';
/** CI-only full app. Not run locally: builders have no WASM toolchain. Local real-component checks live in test/animation-preview.tsx (?animators=1) and animation-p9.test.ts. */
test('P9 timeline parent picker and per-character text animators',async({page})=>{
 await page.goto('/');await page.evaluate(async()=>{const {requestStudio}=await import('/src/store/appStore.ts');requestStudio('animation');});await page.getByTestId('animation-create-blank').click();
 await page.getByTestId('animation-add-shape').click();await page.getByTestId('animation-add-null').click();
 // Timeline parent picker: reparent the shape to the null layer, then clear it.
 const pickers=page.locator('select[data-testid^="animation-parent-"]');await expect(pickers).toHaveCount(2);
 await pickers.first().selectOption({label:/Null/});await expect(page.getByRole('listitem').filter({hasText:'↳'}).first()).toBeVisible();
 await pickers.first().selectOption('');await expect(page.getByRole('listitem').filter({hasText:'↳'})).toHaveCount(0);
 // Text animators: add one, change its range, undo.
 await page.getByTestId('animation-add-text').click();
 await page.getByTestId('animation-animator-add').click();
 await expect(page.getByTestId('animation-animator-0')).toBeVisible();
 await page.getByTestId('animation-animator-add').click();await page.getByTestId('animation-animator-add').click();await page.getByTestId('animation-animator-add').click();
 await expect(page.getByTestId('animation-animator-add')).toBeDisabled();
 await page.getByRole('button',{name:/Undo|Rückgängig/}).click();await expect(page.getByTestId('animation-animator-add')).toBeEnabled();
 await expect(page.getByTestId('animation-viewer').locator('tspan').first()).toBeVisible();
});
