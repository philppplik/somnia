import {test,expect} from './fixtures';
/** CI-only full app. Not run locally: builders have no WASM toolchain. Local real-component checks live in test/animation-preview.tsx. */
test('P6 text fonts, per-key easing and null parenting with keep-world',async({page})=>{
 await page.goto('/');await page.evaluate(async()=>{const {requestStudio}=await import('/src/store/appStore.ts');requestStudio('animation');});await page.getByTestId('animation-create-blank').click();
 // Text layer with a chosen safe system font.
 await page.getByTestId('animation-add-text').click();
 const font=page.getByTestId('animation-text-font');await expect(font).toBeVisible();await font.selectOption('mono');await expect(font).toHaveValue('mono');
 // Animate position, land on the first key and pick an ease preset for that key.
 await page.getByLabel('Position', {exact:false}).first().waitFor();
 await page.getByTestId('animation-prop-position').getByLabel(/Animate|animieren/).check();
 await page.getByTestId('animation-key-ease').selectOption('easeIn');await expect(page.getByTestId('animation-key-ease')).toHaveValue('easeIn');
 // Graph editor: ease presets apply to selected keys.
 await page.getByTestId('animation-graph-toggle').click();await page.getByTestId('animation-graph-key').first().click();
 await page.getByTestId('animation-graph-ease-easeOut').click();
 await page.getByTestId('animation-graph-toggle').click();
 // Null object parenting with keep-world.
 await page.getByTestId('animation-add-null').click();
 await page.getByTestId('animation-add-shape').click();
 await page.getByRole('region',{name:'Properties',exact:true}).getByLabel('Keep world transform',{exact:true}).check();
 await page.getByRole('region',{name:'Properties',exact:true}).getByRole('combobox',{name:'Parent layer',exact:true}).selectOption({label:'Null 1 (Null)'});
 await expect(page.getByRole('listitem').filter({hasText:'↳'}).first()).toBeVisible();
});
