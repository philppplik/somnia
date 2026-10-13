import {test,expect} from './fixtures';
import {mkdirSync} from 'node:fs';
const shot=(n:string)=>{mkdirSync('test-results/shell',{recursive:true});return `test-results/shell/${n}.png`;};
const LEFT_ORDER=['layers','files','search','components','css','versions','responsive','outline'];
test.use({sample:true});
test('Code studio rail: declared icons, order and customization (shell v2)',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.keyboard.press('Control+1');
 const left=page.getByRole('toolbar',{name:'Sidebar panels'});
 // studio-owned rail icons exist in the declared order, with the migrated icon set
 const ids=async()=>left.locator('[data-rail-item]').evaluateAll(els=>els.map(e=>e.getAttribute('data-rail-item')));
 expect(await ids()).toEqual(LEFT_ORDER);
 for(const id of LEFT_ORDER)await expect(left.locator(`[data-rail-item="${id}"]`)).toBeVisible();
 await expect(left.locator('[data-rail-item][draggable="true"]').first()).toBeVisible();
 // right rail is the single generic inspector
 const right=page.getByRole('toolbar',{name:'Inspector panels'});
 expect(await right.locator('[data-rail-item]').evaluateAll(els=>els.map(e=>e.getAttribute('data-rail-item')))).toEqual(['inspector']);
 await page.screenshot({path:shot('code-rail-default')});
 // rail customization: hide Versions via the context menu, bring it back from the overflow menu
 await left.locator('[data-rail-item="versions"]').click({button:'right'});
 await page.getByRole('menuitem',{name:'Hide rail icon'}).click();
 await expect(left.locator('[data-rail-item="versions"]')).toHaveCount(0);
 await left.getByTestId('rail-more').click();
 await page.screenshot({path:shot('code-rail-more-menu')});
 await page.getByRole('menuitem',{name:'Show Versions'}).click();
 await expect(left.locator('[data-rail-item="versions"]')).toBeVisible();
 // reorder persists across reload
 await left.locator('[data-rail-item="search"]').click({button:'right'});
 await page.getByRole('menuitem',{name:'Move rail icon up'}).click();
 const before=await ids();expect(before.indexOf('search')).toBeLessThan(before.indexOf('files'));
 await page.reload();await expect(page.locator('[data-storage]')).toBeVisible();
 await page.keyboard.press('Control+1');
 expect(await ids()).toEqual(before);
 await page.evaluate(async()=>{const m=await import('/src/lib/commands.ts');await m.executeCommand('shell.rail.reset');});
 expect(await ids()).toEqual(LEFT_ORDER);
});
// Requires the panel wave hosts (lib/codePanels/shell.ts + components/studios/code/registerShell.ts).
test('Code inspector: generic host shows the declared sections',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.keyboard.press('Control+1');
 await expect(page.getByTestId('shell-inspector')).toBeVisible();
 await expect(page.getByTestId('inspector-section-design')).toBeVisible();
 await expect(page.getByTestId('inspector-section-interactions')).toBeVisible();
 await expect(page.getByTestId('inspector-section-source')).toBeVisible();
 await page.screenshot({path:shot('code-inspector-sections')});
});
