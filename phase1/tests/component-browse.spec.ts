import {test,expect} from './fixtures';
import {openMine} from './helpers';
test('components panel: blocks search/chips, save, organize, search both scopes, drag-insert with undo',async({page})=>{
 await page.goto('/');const f=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(f.locator('h1')).toBeVisible();
 await page.getByRole('button',{name:'section',exact:true}).click();await page.getByRole('button',{name:'Components panel',exact:true}).click();
 // one panel: header, search, scope tabs with live counts, chips, grouped grid
 await expect(page.getByTestId('scope-blocks')).toContainText('44');await expect(page.getByTestId('scope-mine')).toContainText('0');
 await expect(page.getByTestId('category-chips').getByRole('button')).toHaveCount(8);
 await expect(page.getByTestId('component-card')).toHaveCount(21);
 await page.getByRole('button',{name:'Navigation',exact:true}).click();await expect(page.getByTestId('component-card')).toHaveCount(3);
 await page.getByRole('button',{name:'All',exact:true}).click();
 await page.getByLabel('Search components').fill('hero');await expect(page.getByTestId('browse-count')).toContainText('results for "hero"');
 await expect(page.getByRole('group',{name:'Card Hero',exact:true})).toBeVisible();
 await page.getByLabel('Search components').fill('nomatch');await expect(page.getByText('No blocks for "nomatch"')).toBeVisible();
 await page.getByRole('button',{name:'Clear search'}).first().click();
 // built-in is read-only: menu offers Duplicate, not Rename/Remove
 await page.getByRole('group',{name:'Card Hero',exact:true}).click({button:'right'});
 await expect(page.getByRole('menuitem',{name:'Duplicate to My library'})).toBeVisible();await expect(page.getByRole('menuitem',{name:'Rename…'})).toHaveCount(0);
 await page.getByRole('menuitem',{name:'Duplicate to My library'}).click();await expect(page.getByTestId('scope-mine')).toContainText('1');
 // save a selection, organize it from the card menu
 await page.getByRole('button',{name:'Layers panel',exact:true}).click();await page.getByRole('button',{name:'section',exact:true}).first().click();await page.getByRole('button',{name:'Components panel',exact:true}).click();
 await page.getByRole('button',{name:'Save selection',exact:true}).click();await page.getByLabel('Component name').fill('Pricing card');await page.getByRole('button',{name:'Save',exact:true}).click();
 const mine=page.getByRole('group',{name:'Card Pricing card',exact:true});await expect(mine).toBeVisible();
 await expect(mine.locator('iframe')).toHaveAttribute('sandbox','');
 await mine.click({button:'right'});await page.getByRole('menuitem',{name:'Organize…'}).click();
 await page.getByLabel('Folder for Pricing card').fill('Marketing');await page.getByLabel('New tag for Pricing card').fill('Sales');await page.getByLabel('New tag for Pricing card').press('Enter');await page.getByRole('button',{name:'Done'}).click();
 await expect(mine).toContainText('Marketing');await expect(mine).toContainText('#sales');
 // search covers both scopes: tag matches only My library
 await page.getByLabel('Search components').fill('sales');await expect(page.getByTestId('browse-count')).toContainText('1 results');await expect(mine).toBeVisible();
 await page.getByLabel('Search components').fill('');
 await page.reload();await page.getByRole('button',{name:'Components panel',exact:true}).click();await expect(page.getByTestId('scope-blocks')).toHaveAttribute('aria-selected','true');
 await page.getByTestId('scope-mine').click();await expect(page.getByRole('group',{name:'Card Pricing card'})).toContainText('#sales');
 // drag into canvas: payload is a component id pair; undo removes the insert
 const before=await f.locator('article').count();
 const dt=await page.evaluateHandle(()=>new DataTransfer());
 await page.getByRole('button',{name:'Select Pricing card'}).dispatchEvent('dragstart',{dataTransfer:dt});
 await expect(page.getByTestId('component-drag-hint')).toContainText('Esc to cancel');
 const payload=await dt.evaluate(d=>d.getData('application/x-somnia-component'));expect(payload).toMatch(/.+:.+/);
 await page.locator('iframe[title="Sandboxed design preview"]').contentFrame().locator('main').evaluate((el,pl)=>{const d=new DataTransfer();d.setData('application/x-somnia-component',pl);el.dispatchEvent(new DragEvent('drop',{dataTransfer:d,bubbles:true,cancelable:true}));},payload);
 await expect(page.getByTestId('component-drag-hint')).toHaveCount(0);
 await expect(f.locator('[data-somnia-component]')).toHaveCount(1);
 await page.keyboard.press('Control+z');await expect(f.locator('[data-somnia-component]')).toHaveCount(0);
});
test('insert without a selection falls back to the end of body with a notice; Replace needs a selection',async({page})=>{
 await page.goto('/');const f=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(f.locator('h1')).toBeVisible();
 await page.getByRole('button',{name:'Components panel',exact:true}).click();
 const hero=page.getByRole('group',{name:'Card Hero',exact:true});await hero.hover();
 await expect(page.getByRole('button',{name:'Replace selection with Hero, variant Centered'})).toBeDisabled();
 await page.getByRole('button',{name:'Insert Hero, variant Centered'}).click();
 await expect(f.locator('section.sk-hero-center')).toHaveCount(1);await expect(page.getByRole('status').first()).toContainText('end of body');
 await page.keyboard.press('Control+z');await expect(f.locator('section.sk-hero-center')).toHaveCount(0);
});
