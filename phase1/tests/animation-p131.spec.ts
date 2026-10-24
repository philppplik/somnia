import {test,expect} from './fixtures';
// CI-only (needs the Tauri/Vite app in a browser). Not run in the authoring sandbox.
test('animation key tools menu: grouped items, enablement follows the key selection',async({page})=>{
 await page.goto('/');
 await page.evaluate(async()=>{const {requestStudio}=await import('/src/store/appStore.ts');requestStudio('animation');});
 await page.getByTestId('animation-create-blank').click();
 await expect(page.getByTestId('animation-workspace')).toBeVisible();
 await page.getByTestId('animation-add-shape').click();
 await page.getByLabel('Animate Opacity').check();
 await page.getByTestId('animation-timeline').getByLabel('Next frame').click();
 await page.getByLabel('Opacity',{exact:true}).fill('20');await page.getByLabel('Opacity',{exact:true}).press('Enter');
 const keys=page.getByTestId('animation-keyrow-opacity').locator('button[data-key-prop]');
 await expect(keys).toHaveCount(2);
 // Key diamonds on adjacent frames overlap at the default zoom and selection lives on pointerdown (drag start), so select the exact keys by keyboard: Enter selects, Shift+Enter extends.
 await keys.nth(0).press('Enter');await keys.nth(1).press('Shift+Enter');
 const groups:[string,string[]][]=[['values',['flatten','average','match','ramp','thin']],['ease',['ease-copy','influence','tame']],['select',['peaks','invert-selection','property','nth']]];
 for(const [g,ids] of groups){
  // An open submenu leaves the parent menu inert, so walk one group at a time: open the menu, open the group, check, then close both popups.
  await page.getByTestId('animation-keys-tools').click();
  await page.getByTestId(`animation-keys-group-${g}`).click();
  for(const id of ids)await expect(page.getByTestId(`animation-keys-${id}`)).toBeVisible();
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await expect(page.getByTestId(`animation-keys-group-${g}`)).toBeHidden();
 }
 await page.getByTestId('animation-keys-tools').click();
 await page.getByTestId('animation-keys-group-values').click();
 await expect(page.getByTestId('animation-keys-flatten')).toBeEnabled();
 await expect(page.getByTestId('animation-keys-ramp')).toBeDisabled();
 await page.getByTestId('animation-keys-flatten').click();
 await expect(page.getByTestId('animation-keys-flatten')).toBeHidden();
 await page.getByTestId('animation-timeline').getByLabel('Undo').click();
});
