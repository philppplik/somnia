import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
test.use({viewport:{width:1200,height:900}});
test('filmstrip lists the developable photos and switches the active one',async({page})=>{
 await page.goto('/test/design-system/?view=photos-filmstrip');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await expect(page.getByTestId('photos-filmstrip')).toBeVisible();
 await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveAttribute('aria-pressed','true');
 await page.getByTestId('photos-filmstrip-item-strip-2.png').click();
 await expect(page.getByTestId('photos-name')).toHaveText('strip-2.png');
 await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toHaveAttribute('aria-pressed','true');
 await expect(page.getByTestId('photos-position')).toHaveText('2 / 3');
 await page.getByTestId('photos-filmstrip-item-strip-3.png').click();
 await expect(page.getByTestId('photos-name')).toHaveText('strip-3.png');
 await expect(page.getByTestId('photos-position')).toHaveText('3 / 3');
});
test('filmstrip renders in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await page.getByTestId('photos-zoom-actual').click();
  await page.waitForTimeout(500);
  const png=await page.getByTestId('photos-canvas').evaluate(c=>(c as HTMLCanvasElement).toDataURL('image/png'));
  await writeFile(`test-results/ds-photos-filmstrip-canvas-${theme}.png`,Buffer.from(png.split(',')[1],'base64'));
  const thumb=page.getByTestId('photos-filmstrip-item-strip-2.png');
  if(await thumb.count()){await thumb.click();await expect(page.getByTestId('photos-position')).toHaveText('2 / 3');}
  await page.waitForTimeout(300);
  await page.screenshot({path:`test-results/ds-photos-filmstrip-${theme}.png`,fullPage:true});
 }
});
