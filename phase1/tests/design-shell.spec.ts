import {test,expect} from './fixtures';
import {switchStudio} from './helpers';
import {mkdirSync} from 'node:fs';
const shot=(n:string)=>{mkdirSync('test-results/shell-design',{recursive:true});return `test-results/shell-design/${n}.png`;};
for(const theme of ['light','dark']){
 test(`${theme}: Design rails, panels, inspector sections, commands and rail customization`,async({page})=>{
  await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
  await page.evaluate(async t=>{const m=await import('/src/lib/commands.ts');await m.executeCommand('theme.'+t);},theme);
  await switchStudio(page,'Design');
  const left=page.getByRole('toolbar',{name:'Sidebar panels'});
  // Without a design only the panel icons exist, no tools
  await expect(left.locator('[data-rail-item="layers"]')).toBeVisible();
  await expect(left.locator('[data-rail-item="tool-select"]')).toHaveCount(0);
  await page.getByTestId('design-create-blank').click();
  for(const id of ['files','layers','artboards','colors','tool-select','tool-hand','tool-rectangle','tool-text','tool-frame'])await expect(left.locator(`[data-rail-item="${id}"]`)).toBeVisible();
  // Inspector: Artboard + Project sections without selection, selection sections after adding a layer
  await expect(page.getByTestId('design-section-artboard')).toBeVisible();
  await expect(page.getByTestId('design-inspector')).toHaveCount(0);
  await page.getByTestId('design-add-rectangle').click();
  await expect(page.getByTestId('design-inspector')).toBeVisible();await expect(page.getByTestId('design-section-arrange')).toBeVisible();
  await page.getByTestId('design-add-text').click();
  await page.screenshot({path:shot(`${theme}-layers-inspector`)});
  // Rail tool item activates the tool (the artboard tool adds one and opens the Artboards panel)
  await left.locator('[data-rail-item="tool-rectangle"]').click();
  await page.getByTestId('design-artboard').click({position:{x:400,y:300}});
  await expect(page.getByTestId('design-layer-row')).toHaveCount(3);
  await left.locator('[data-rail-item="tool-frame"]').click();
  await expect(page.getByTestId('design-board-row')).toHaveCount(2);
  await page.screenshot({path:shot(`${theme}-artboards`)});
  // Artboard section: preset and orientation
  await page.getByTestId('design-board-preset').selectOption('story');
  await expect(page.getByTestId('design-board-width')).toHaveValue('1080');await expect(page.getByTestId('design-board-height')).toHaveValue('1920');
  await page.getByTestId('design-board-rotate').click();await expect(page.getByTestId('design-board-width')).toHaveValue('1920');
  await page.getByTestId('design-board-width').fill('abc');await page.getByTestId('design-board-width').press('Enter');await expect(page.getByTestId('design-board-width-error')).toBeVisible();
  await page.getByTestId('design-board-width').press('Escape');
  // Colours panel: swatches apply to the selection
  await expect(page.getByTestId('design-artboards-panel')).toBeVisible();
  await page.getByTestId('design-board-row').first().getByTestId('design-board-name').click();
  await left.locator('[data-rail-item="layers"]').click();
  await page.getByTestId('design-layer-row').first().click();
  await left.locator('[data-rail-item="colors"]').click();
  await expect(page.getByTestId('design-colors-panel')).toBeVisible();
  await page.getByTestId('design-swatch').first().click();
  await page.screenshot({path:shot(`${theme}-colors`)});
  // Arrange section changes the stacking order
  const first=await page.getByTestId('design-layer-row').first().getAttribute('data-layer-id');
  await page.getByTestId('design-layer-row').nth(1).click();
  await page.getByTestId('design-stack-front').click();
  await expect(page.getByTestId('design-layer-row').first()).not.toHaveAttribute('data-layer-id',first!);
  // Rail customization: hide Colours via the context menu, bring it back from the overflow menu
  await left.locator('[data-rail-item="colors"]').click({button:'right'});
  await page.getByRole('menuitem',{name:'Hide rail icon'}).click();
  await expect(left.locator('[data-rail-item="colors"]')).toHaveCount(0);
  await left.getByTestId('rail-more').click();
  await page.screenshot({path:shot(`${theme}-rail-menu`)});
  await page.getByRole('menuitem',{name:'Show Colours'}).click();
  await expect(left.locator('[data-rail-item="colors"]')).toBeVisible();
  // Menus: View > Zoom, Edit > Design submenus come from the manifest and the grouping table
  await page.evaluate(async()=>{const m=await import('/src/lib/commands.ts');await m.executeCommand('design.zoomFit');});
  await page.screenshot({path:shot(`${theme}-fit`)});
 });
}
