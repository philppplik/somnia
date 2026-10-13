import {test,expect} from './fixtures';
import {readFileSync,mkdirSync} from 'node:fs';
const XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FIXTURE=readFileSync(new URL('../sheets-craft/fixtures/fixture.xlsx',import.meta.url));
async function openXlsx(page:any){const chooser=page.waitForEvent('filechooser');await page.evaluate(async()=>{const m=await import('/src/lib/commands.ts');void m.executeCommand('project.openMedia');});(await chooser).setFiles([{name:'sales.xlsx',mimeType:XLSX,buffer:FIXTURE}]);}
const shot=(n:string)=>{mkdirSync('test-results/shell',{recursive:true});return `test-results/shell/${n}.png`;};
for(const theme of ['light','dark']){
 test(`${theme}: Sheets rails, panels, inspector sections and rail customization`,async({page})=>{
  await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
  await page.evaluate(async t=>{const m=await import('/src/lib/commands.ts');await m.executeCommand('theme.'+t);},theme);
  await openXlsx(page);
  await page.getByRole('radio',{name:'Somnia Sheets'}).click();
  await expect(page.getByTestId('sheets-grid')).toBeVisible();
  const left=page.getByRole('toolbar',{name:'Sidebar panels'});
  const right=page.getByRole('toolbar',{name:'Inspector panels'});
  // Studio rail: workbook/files/search/analysis pinned, versions in the overflow by default.
  for(const id of ['workbook','files','search','analysis'])await expect(left.locator(`[data-rail-item="${id}"]`)).toBeVisible();
  await expect(left.locator('[data-rail-item="versions"]')).toHaveCount(0);
  for(const id of ['inspector','formulas','export'])await expect(right.locator(`[data-rail-item="${id}"]`)).toBeVisible();
  await page.screenshot({path:shot(`${theme}-sheets-shell`)});
  await left.locator('[data-rail-item="workbook"]').screenshot({path:shot(`${theme}-sheets-rail-icon-workbook`)});
  // Overflow menu holds Versions; a pinned item moves to the overflow from its context menu.
  await left.getByTestId('rail-more').click();
  await page.screenshot({path:shot(`${theme}-sheets-rail-overflow`)});
  await expect(page.getByRole('menuitem',{name:'Pin Versions'})).toBeVisible();
  await page.keyboard.press('Escape');
  await left.locator('[data-rail-item="analysis"]').click({button:'right'});
  await page.getByRole('menuitem',{name:'Move rail icon to overflow'}).click();
  await expect(left.locator('[data-rail-item="analysis"]')).toHaveCount(0);
  await left.getByTestId('rail-more').click();
  await expect(page.getByRole('menuitem',{name:'Pin Analysis'})).toBeVisible();
  await page.getByRole('menuitem',{name:'Reset rails of this studio'}).click();
  await expect(left.locator('[data-rail-item="analysis"]')).toBeVisible();
  // Generic inspector with the cell + formulas sections on the right.
  await expect(page.getByTestId('shell-inspector')).toBeVisible();
  await expect(page.getByTestId('inspector-section-cell')).toBeVisible();
  await expect(page.getByTestId('inspector-section-formulas')).toBeVisible();
  await page.screenshot({path:shot(`${theme}-sheets-inspector`)});
  // Export quick action downloads a real copy of the workbook.
  const dl=page.waitForEvent('download');await right.locator('[data-rail-item="export"]').click();
  expect((await dl).suggestedFilename()).toBe('sales-edited.xlsx');
  // Customization: hide Analysis via the context menu, bring it back from the overflow menu.
  await left.locator('[data-rail-item="analysis"]').click({button:'right'});
  await page.screenshot({path:shot(`${theme}-sheets-rail-menu`)});
  await page.getByRole('menuitem',{name:'Hide rail icon'}).click();
  await expect(left.locator('[data-rail-item="analysis"]')).toHaveCount(0);
  await left.getByTestId('rail-more').click();
  await page.getByRole('menuitem',{name:'Show Analysis'}).click();
  await expect(left.locator('[data-rail-item="analysis"]')).toBeVisible();
  // Reorder persists across reload.
  await left.locator('[data-rail-item="workbook"]').click({button:'right'});
  await page.getByRole('menuitem',{name:'Move rail icon down'}).click();
  const order=async()=>left.locator('[data-rail-item]').evaluateAll(els=>els.map(e=>e.getAttribute('data-rail-item')));
  const before=await order();expect(before.indexOf('files')).toBeLessThan(before.indexOf('workbook'));
  await page.reload();await expect(page.locator('[data-storage]')).toBeVisible();
  await page.getByRole('radio',{name:'Somnia Sheets'}).click();
  expect(await order()).toEqual(before);
  await page.evaluate(async()=>{const m=await import('/src/lib/commands.ts');await m.executeCommand('shell.rail.reset');});
 });
}
