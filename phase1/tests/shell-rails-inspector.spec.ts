import {showPanel} from './helpers';
import {test,expect} from './fixtures';
import {readFileSync,mkdirSync} from 'node:fs';
const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const sample=()=>readFileSync('test/documents/sample.docx');
async function openDocx(page:any){const chooser=page.waitForEvent('filechooser');await page.evaluate(async()=>{const m=await import('/src/lib/commands.ts');void m.executeCommand('project.openMedia');});(await chooser).setFiles([{name:'sample.docx',mimeType:DOCX,buffer:sample()}]);}
const shot=(n:string)=>{mkdirSync('test-results/shell',{recursive:true});return `test-results/shell/${n}.png`;};
for(const theme of ['light','dark']){
 test(`${theme}: Documents rails, panels, inspector sections and rail customization`,async({page})=>{
  await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
  await page.evaluate(async t=>{const m=await import('/src/lib/commands.ts');await m.executeCommand('theme.'+t);},theme);
  await openDocx(page);
  await expect(page.getByTestId('documents-pages')).toHaveText('1 pages');
  const left=page.getByRole('toolbar',{name:'Sidebar panels'});
  // studio-owned rail icons exist
  for(const id of ['files','pages','outline','search','versions'])await expect(left.locator(`[data-rail-item="${id}"]`)).toBeVisible();
  // Pages panel shows a thumbnail, a click scrolls to that page
  await showPanel(page,'Pages');
  await expect(page.getByTestId('documents-thumb').first()).toBeVisible();
  // Outline panel lists paragraphs and filters
  await showPanel(page,'Outline');
  await expect(page.getByTestId('documents-outline-panel')).toBeVisible();
  await page.screenshot({path:shot(`${theme}-outline`)});
  // Inspector contents are tested after explicitly opening it, independent of studio-open defaults.
  await showPanel(page,'Document');
  // Document section always, selection section only with a caret paragraph
  await expect(page.getByTestId('shell-inspector')).toBeVisible();
  await expect(page.getByTestId('inspector-section-document')).toBeVisible();
  await expect(page.getByTestId('inspector-section-selection')).toHaveCount(0);
  await page.getByTestId('documents-page').first().click({position:{x:80,y:90}});
  await expect(page.getByTestId('inspector-section-selection')).toBeVisible();
  await page.screenshot({path:shot(`${theme}-inspector-selection`)});
  // Rail customization: hide Pages through the context menu, bring it back from the overflow menu, reset
  await left.locator('[data-rail-item="pages"]').click({button:'right'});
  await page.getByRole('menuitem',{name:'Hide rail icon'}).click();
  await expect(left.locator('[data-rail-item="pages"]')).toHaveCount(0);
  await left.getByTestId('rail-more').click();
  await page.screenshot({path:shot(`${theme}-rail-menu`)});
  await page.getByRole('menuitem',{name:'Show Pages'}).click();
  await expect(left.locator('[data-rail-item="pages"]')).toBeVisible();
  // order persists across reload
  await left.locator('[data-rail-item="outline"]').click({button:'right'});
  await page.getByRole('menuitem',{name:'Move rail icon up'}).click();
  const order=async()=>left.locator('[data-rail-item]').evaluateAll(els=>els.map(e=>e.getAttribute('data-rail-item')));
  const before=await order();expect(before.indexOf('outline')).toBeLessThan(before.indexOf('pages'));
  await page.reload();await expect(page.locator('[data-storage]')).toBeVisible();
  await page.keyboard.press('Control+2');
  expect(await order()).toEqual(before);
  await page.evaluate(async()=>{const m=await import('/src/lib/commands.ts');await m.executeCommand('shell.rail.reset');});
 });
}
test('Code studio migrated to the shell rail: draggable icons, customization available',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.keyboard.press('Control+1');
 const left=page.getByRole('toolbar',{name:'Sidebar panels'});
 await expect(left.locator('[data-rail-item][draggable="true"]').first()).toBeVisible();
 // nothing overflows by default, so no overflow button until the user unpins or hides an item
 await expect(left.getByTestId('rail-more')).toHaveCount(0);
 await left.locator('[data-rail-item="versions"]').click({button:'right'});
 await expect(page.getByRole('menuitem',{name:'Hide rail icon'})).toBeVisible();
 await page.keyboard.press('Escape');
});
