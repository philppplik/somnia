import {test,expect} from './fixtures';
import path from 'node:path';
import {readFileSync} from 'node:fs';
const asset=(n:string)=>path.join(import.meta.dirname,'assets',n);
async function openPhoto(page:any){
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.getByRole('radio',{name:'Somnia Photos'}).click();
 await expect(page.getByTestId('photos-start')).toBeVisible();
 const chooser=page.waitForEvent('filechooser');await page.getByTestId('photos-open').click();(await chooser).setFiles(asset('photo.jpg'));
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await expect(page.getByTestId('photos-name')).toContainText('photo.jpg');
 await expect(page.getByTestId('photos-info')).toContainText('240');
}
test('Photos Studio: open a JPEG, develop it, crop, rotate, export PNG',async({page})=>{
 await openPhoto(page);
 await expect(page.getByRole('radio',{name:'Somnia Photos'})).toHaveAttribute('aria-checked','true');
 await expect(page.getByTestId('photos-inspector')).toBeVisible();
 await expect(page.getByTestId('photos-undo')).toBeDisabled();
 await page.screenshot({path:'test-results/photos-open.png'});
 // one slider gesture is one undo step
 const slider=page.getByTestId('photos-slider-exposure');
 await slider.fill('1.5');
 await expect(page.getByTestId('photos-value-exposure')).toContainText('1.5');
 await page.getByTestId('photos-slider-contrast').fill('25');
 await expect(page.getByTestId('photos-undo')).toBeEnabled();
 await page.screenshot({path:'test-results/photos-edited.png'});
 // undo walks back one step per click
 await page.getByTestId('photos-undo').click();
 await expect(page.getByTestId('photos-value-contrast')).toContainText('0');
 await expect(page.getByTestId('photos-value-exposure')).toContainText('1.5');
 await page.getByTestId('photos-undo').click();
 await expect(page.getByTestId('photos-value-exposure')).toContainText('0');
 await page.getByTestId('photos-redo').click();await page.getByTestId('photos-redo').click();
 await expect(page.getByTestId('photos-value-contrast')).toContainText('25');
 // rotate and flip
 await page.getByTestId('photos-rotate-right').click();
 await expect(page.getByTestId('photos-undo')).toBeEnabled();
 await page.getByTestId('photos-rotate-left').click();
 await page.getByTestId('photos-flip-h').click();
 await expect(page.getByTestId('photos-flip-h')).toHaveAttribute('aria-pressed','true');
 await page.getByTestId('photos-flip-h').click();
 // crop: enter crop mode, drag a frame, apply
 await page.getByTestId('photos-crop').click();
 await expect(page.getByTestId('photos-crop-overlay')).toBeVisible();
 const box=(await page.getByTestId('photos-stage').boundingBox())!;
 await page.mouse.move(box.x+box.width*0.3,box.y+box.height*0.3);
 await page.mouse.down();
 await page.mouse.move(box.x+box.width*0.7,box.y+box.height*0.7,{steps:5});
 await page.mouse.up();
 await expect(page.getByTestId('photos-crop-frame')).toBeVisible();
 await page.screenshot({path:'test-results/photos-crop.png'});
 await page.getByTestId('photos-crop-apply').click();
 await expect(page.getByTestId('photos-crop-overlay')).toBeHidden();
 // compare hold shows the original
 await page.getByTestId('photos-compare').dispatchEvent('pointerdown');
 await page.getByTestId('photos-compare').dispatchEvent('pointerup');
 // zoom controls
 await page.getByTestId('photos-zoom-in').click();
 await expect(page.getByTestId('photos-zoom-level')).not.toContainText('100%');
 await page.getByTestId('photos-zoom-fit').click();
 // export produces a real PNG
 const download=page.waitForEvent('download');await page.getByTestId('photos-export-png').click();const d=await download;
 expect(d.suggestedFilename()).toBe('photo-edited.png');
 const bytes=readFileSync(await d.path()!);
 expect(bytes.subarray(1,4).toString()).toBe('PNG');expect(bytes.length).toBeGreaterThan(5000);
 // JPEG export too
 const dl2=page.waitForEvent('download');await page.getByTestId('photos-export-jpeg').click();const d2=await dl2;
 expect(d2.suggestedFilename()).toBe('photo-edited.jpg');
 const jpg=readFileSync(await d2.path()!);
 expect(jpg[0]).toBe(0xff);expect(jpg[1]).toBe(0xd8);
 // reset returns to neutral
 await page.getByTestId('photos-reset').click();
 await expect(page.getByTestId('photos-value-exposure')).toContainText('0');
});
test('Photos Studio: an unsupported file gets an honest rejection, not a fake develop',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.getByRole('radio',{name:'Somnia Photos'}).click();
 await expect(page.getByTestId('photos-start')).toBeVisible();
 const chooser=page.waitForEvent('filechooser');await page.getByTestId('photos-open').click();(await chooser).setFiles(asset('photo.webp'));
 await expect(page.getByTestId('photos-unsupported')).toBeVisible();
 await expect(page.getByTestId('photos-unsupported')).toContainText('JPEG and PNG');
 await page.screenshot({path:'test-results/photos-unsupported.png'});
});
test('Photos Studio: switching to Code keeps the photo session intact',async({page})=>{
 await openPhoto(page);
 await page.getByTestId('photos-slider-exposure').fill('1');
 await page.getByRole('radio',{name:'Somnia Code'}).click();
 // an image tab outside the Photos studio keeps the existing raster editor
 await expect(page.getByRole('region',{name:'Image editing viewport'})).toBeVisible();
 await page.keyboard.press('Control+7');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await expect(page.getByTestId('photos-value-exposure')).toContainText('1');
});
for(const locale of ['de','es','fr','pt-BR'])test(`Photos Studio strings: ${locale}`,async({page})=>{
 await page.addInitScript(l=>localStorage.setItem('somnia.locale.v1',l),locale);await page.goto('/');
 const pill=page.locator('header [role="radiogroup"]');
 await expect(pill.getByRole('radio')).toHaveCount(7);
 await expect(pill).not.toContainText('studio.photos');
 await pill.getByRole('radio').nth(6).click();
 await expect(page.getByTestId('photos-start')).toBeVisible();
 await expect(page.getByTestId('photos-start')).not.toContainText('photos.');
});
