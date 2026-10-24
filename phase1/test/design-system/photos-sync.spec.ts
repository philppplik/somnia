import {test,expect} from '@playwright/test';
test.use({viewport:{width:1200,height:1000}});
test('settings sync: copy from one photo, paste onto another',async({page})=>{
 await page.goto('/test/design-system/?view=photos-sync');
 const a=page.getByTestId('photos-sync-a'),b=page.getByTestId('photos-sync-b');
 await expect(a.getByTestId('photos-workspace')).toBeVisible();
 await expect(b.getByTestId('photos-workspace')).toBeVisible();
 await expect(b.getByTestId('photos-settings-paste')).toBeDisabled();
 await a.getByTestId('photos-settings-copy').click();
 await expect(a.getByTestId('photos-note')).toContainText(/copied/i);
 await expect(b.getByTestId('photos-settings-paste')).toBeEnabled();
 await b.getByTestId('photos-settings-paste').click();
 await expect(b.getByTestId('photos-note')).toContainText(/pasted/i);
 await expect(b.getByTestId('photos-undo')).toBeEnabled();
});
test('settings sync renders in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-sync');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  const a=page.getByTestId('photos-sync-a'),b=page.getByTestId('photos-sync-b');
  await expect(a.getByTestId('photos-workspace')).toBeVisible();
  await expect(b.getByTestId('photos-workspace')).toBeVisible();
  const copy=a.getByTestId('photos-settings-copy');
  if(await copy.count()){
   await copy.click();
   await b.getByTestId('photos-settings-paste').click();
   await expect(b.getByTestId('photos-undo')).toBeEnabled();
  }
  await page.waitForTimeout(500);
  await page.screenshot({path:`test-results/ds-photos-sync-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-stage').first().screenshot({path:`test-results/ds-photos-sync-stage-${theme}.png`});
 }
});
