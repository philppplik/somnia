import {test,expect} from './fixtures';
import {openMine} from './helpers';
test('blocks insert with undo and personal saved source survives reload',async({page})=>{
 await page.goto('/');const frame=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(frame.locator('h1')).toBeVisible();await page.getByRole('button',{name:'section',exact:true}).click();await page.getByRole('button',{name:'Components panel',exact:true}).click();await page.getByTestId('basics-group').getByRole('button',{name:'Card',exact:true}).click();await expect(frame.locator('article')).toHaveCount(1);await page.keyboard.press('Control+z');await expect(frame.locator('article')).toHaveCount(0);await page.getByRole('button',{name:'Layers panel',exact:true}).click();await page.getByRole('button',{name:'section',exact:true}).first().click();await page.getByRole('button',{name:'Components panel',exact:true}).click();await page.getByRole('button',{name:'Save selection',exact:true}).click();await page.getByLabel('Component name').fill('Hero copy');await page.getByRole('button',{name:'Save',exact:true}).click();await openMine(page);await expect(page.getByRole('button',{name:'Insert Hero copy Default',exact:true})).toBeVisible();await page.reload();await openMine(page);await expect(page.getByRole('button',{name:'Insert Hero copy Default',exact:true})).toBeVisible();await page.getByRole('button',{name:'Layers panel',exact:true}).click();await page.getByRole('button',{name:'main',exact:true}).click();await openMine(page);await page.getByRole('button',{name:'Insert Hero copy Default',exact:true}).click();await expect(frame.locator('section')).toHaveCount(2);await page.keyboard.press('Control+z');await expect(frame.locator('section')).toHaveCount(1);await page.screenshot({path:'tests/artifacts/component-library-light.png'});
});
test('repeated IDs and unavailable storage refuse without changing source',async({page})=>{await page.addInitScript(()=>localStorage.setItem('somnia.components.v1',JSON.stringify([null,{id:'fixture',name:'Repeated main',html:'<div id="main">Copy</div>'}])));await page.goto('/');const f=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(f.locator('h1')).toBeVisible();await page.getByRole('button',{name:'main',exact:true}).click();await openMine(page);await page.getByRole('button',{name:'Insert Repeated main Default',exact:true}).click();await expect(page.getByRole('status')).toContainText('repeat the source ID');await expect(f.locator('#main')).toHaveCount(1);await page.getByLabel('Component or variant name').fill('No storage');await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('Storage denied');};});await page.getByRole('button',{name:'Save selection as new component',exact:true}).click();await expect(page.getByRole('status')).toContainText('Nothing was changed');await expect(page.getByRole('button',{name:'Insert No storage Default',exact:true})).toHaveCount(0);});

test('variants: add, insert, switch with one undo, default, remove',async({page})=>{
 await page.goto('/');const f=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(f.locator('h1')).toBeVisible();
 await page.getByRole('button',{name:'section',exact:true}).click();await page.getByRole('button',{name:'Components panel',exact:true}).click();
 await page.getByTestId('basics-group').getByRole('button',{name:'Card',exact:true}).click();await expect(f.locator('article')).toHaveCount(1);
 await page.getByRole('button',{name:'Layers panel',exact:true}).click();await page.getByRole('button',{name:'article',exact:true}).first().click();await openMine(page);
 await page.getByRole('button',{name:'Save selection',exact:true}).click();await page.getByLabel('Component name').fill('Card');await page.getByRole('button',{name:'Save',exact:true}).click();await openMine(page);
 await page.getByLabel('Component or variant name').fill('Wide');await page.getByRole('button',{name:'Add selection as variant',exact:true}).click();
 await expect(page.getByRole('group',{name:'Component Card'})).toContainText('Wide');
 await page.getByRole('button',{name:'Layers panel',exact:true}).click();await page.getByRole('button',{name:'main',exact:true}).click();await openMine(page);
 await page.getByRole('button',{name:'Insert Card Wide',exact:true}).click();await expect(f.locator('article[data-somnia-variant]')).toHaveCount(1);
 await page.getByRole('button',{name:'Layers panel',exact:true}).click();await page.getByRole('button',{name:'article',exact:true}).last().click();await openMine(page);
 await expect(page.getByRole('group',{name:'Selected component instance'})).toContainText('Card');
 await page.getByRole('group',{name:'Selected component instance'}).getByRole('button',{name:'Default',exact:true}).click();await expect(f.locator('article[data-somnia-variant]')).toHaveCount(1);
 await page.keyboard.press('Control+z');await expect(f.locator('article[data-somnia-variant]')).toHaveCount(1);await page.keyboard.press('Control+z');await expect(f.locator('article[data-somnia-variant]')).toHaveCount(0);
 await page.getByRole('button',{name:'Make Wide the default of Card'}).click();await expect(page.getByRole('group',{name:'Component Card'})).toContainText('Wide (default)');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Remove variant Wide from Card'}).click();await expect(page.getByRole('group',{name:'Component Card'})).not.toContainText('Wide');
});

test('built-in catalog: always present, insert a variant twice, ids stay clean, no starter button',async({page})=>{
 await page.goto('/');const f=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(f.locator('h1')).toBeVisible();
 await page.getByRole('button',{name:'section',exact:true}).click();await page.getByRole('button',{name:'Components panel',exact:true}).click();
 await expect(page.getByRole('button',{name:'Add starter kit'})).toHaveCount(0);
 await expect(page.getByTestId('scope-blocks')).toContainText('44');
 await page.getByRole('button',{name:'Forms',exact:true}).click();
 await page.getByRole('button',{name:'Insert Contact form, variant Standard',exact:true}).click();await expect(f.locator('form[data-somnia-variant]')).toHaveCount(1);
 await page.getByRole('button',{name:'Insert Contact form, variant Standard',exact:true}).click();await expect(f.locator('form[data-somnia-variant]')).toHaveCount(2);
});
