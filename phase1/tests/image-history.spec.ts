import {test,expect} from './fixtures';
import path from 'node:path';
// Image editor History panel in the real app (browser build, web file host). Screenshot dir via SOMNIA_SHOTS.
const shotDir=process.env.SOMNIA_SHOTS;
test('image editor history: timeline, jump back, toggle and remove an edit',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>window.dispatchEvent(new Event('somnia:edit-image')));
 const dlg=page.getByRole('dialog');
 const chooser=page.waitForEvent('filechooser');
 await dlg.getByRole('button',{name:/open/i}).first().click();
 await (await chooser).setFiles(path.join(process.cwd(),'tests','assets','red.png'));
 const hist=page.getByTestId('image-editor-history');
 await expect(hist).toBeVisible();
 await expect(hist.locator('summary')).toContainText('History (1)');
 await page.getByTestId('imgedit-flip-h').click();
 await page.getByTestId('imgedit-rotate-right').click();
 await expect(hist.locator('.ieh-timeline li')).toHaveCount(3);
 await expect(hist.locator('.ieh-ops li')).toHaveCount(2);
 if(shotDir){await hist.scrollIntoViewIfNeeded();await dlg.screenshot({path:path.join(shotDir,'image-history-1.png')});};
 // jump back to step 1: later steps stay as redo (greyed)
 await hist.locator('.ieh-timeline button').nth(1).click();
 await expect(hist.locator('.ieh-timeline li[data-future=true]')).toHaveCount(1);
 await expect(hist.locator('.ieh-ops li')).toHaveCount(1);
 await expect(dlg.getByRole('button',{name:/^redo$/i})).toBeEnabled();
 // toggle the remaining edit off, then remove it
 await hist.locator('.ieh-ops li button').first().click();
 await expect(hist.locator('.ieh-name[data-off=true]')).toHaveCount(1);
 if(shotDir){await hist.scrollIntoViewIfNeeded();await dlg.screenshot({path:path.join(shotDir,'image-history-2.png')});};
 await hist.locator('.ieh-ops li button').last().click();
 await expect(hist.locator('.ieh-ops li')).toHaveCount(0);
});
