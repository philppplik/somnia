import {test,expect} from './fixtures';
test('blocks insert with undo and personal saved source survives reload',async({page})=>{
 await page.goto('/');const frame=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(frame.locator('h1')).toBeVisible();await page.getByRole('button',{name:'section',exact:true}).click();await page.getByRole('button',{name:'Components panel',exact:true}).click();await page.getByRole('button',{name:'Card',exact:true}).click();await expect(frame.locator('article')).toHaveCount(1);await page.keyboard.press('Control+z');await expect(frame.locator('article')).toHaveCount(0);await page.getByLabel('Component or variant name').fill('Hero copy');await page.getByRole('button',{name:'Save selection as new component',exact:true}).click();await expect(page.getByRole('button',{name:'Insert Hero copy Default',exact:true})).toBeVisible();await page.reload();await page.getByRole('button',{name:'Components panel',exact:true}).click();await expect(page.getByRole('button',{name:'Insert Hero copy Default',exact:true})).toBeVisible();await page.getByRole('button',{name:'Layers panel',exact:true}).click();await page.getByRole('button',{name:'main',exact:true}).click();await page.getByRole('button',{name:'Components panel',exact:true}).click();await page.getByRole('button',{name:'Insert Hero copy Default',exact:true}).click();await expect(frame.locator('section')).toHaveCount(2);await page.keyboard.press('Control+z');await expect(frame.locator('section')).toHaveCount(1);await page.screenshot({path:'tests/artifacts/component-library-light.png'});
});
test('repeated IDs and unavailable storage refuse without changing source',async({page})=>{await page.addInitScript(()=>localStorage.setItem('somnia.components.v1',JSON.stringify([null,{id:'fixture',name:'Repeated main',html:'<div id="main">Copy</div>'}])));await page.goto('/');const f=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(f.locator('h1')).toBeVisible();await page.getByRole('button',{name:'main',exact:true}).click();await page.getByRole('button',{name:'Components panel',exact:true}).click();await page.getByRole('button',{name:'Insert Repeated main Default',exact:true}).click();await expect(page.getByRole('status')).toContainText('repeat the source ID');await expect(f.locator('#main')).toHaveCount(1);await page.getByLabel('Component or variant name').fill('No storage');await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('Storage denied');};});await page.getByRole('button',{name:'Save selection as new component',exact:true}).click();await expect(page.getByRole('status')).toContainText('Nothing was changed');await expect(page.getByRole('button',{name:'Insert No storage Default',exact:true})).toHaveCount(0);});

test('variants: add, insert, switch with one undo, default, remove',async({page})=>{
 await page.goto('/');const f=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(f.locator('h1')).toBeVisible();
 await page.getByRole('button',{name:'section',exact:true}).click();await page.getByRole('button',{name:'Components panel',exact:true}).click();
 await page.getByRole('button',{name:'Card',exact:true}).click();await expect(f.locator('article')).toHaveCount(1);
 await page.getByRole('button',{name:'Layers panel',exact:true}).click();await page.getByRole('button',{name:'article',exact:true}).first().click();await page.getByRole('button',{name:'Components panel',exact:true}).click();
 await page.getByLabel('Component or variant name').fill('Card');await page.getByRole('button',{name:'Save selection as new component',exact:true}).click();
 await page.getByLabel('Component or variant name').fill('Wide');await page.getByRole('button',{name:'Add selection as variant',exact:true}).click();
 await expect(page.getByRole('group',{name:'Component Card'})).toContainText('Wide');
 await page.getByRole('button',{name:'Layers panel',exact:true}).click();await page.getByRole('button',{name:'main',exact:true}).click();await page.getByRole('button',{name:'Components panel',exact:true}).click();
 await page.getByRole('button',{name:'Insert Card Wide',exact:true}).click();await expect(f.locator('article[data-somnia-variant]')).toHaveCount(1);
 await page.getByRole('button',{name:'Layers panel',exact:true}).click();await page.getByRole('button',{name:'article',exact:true}).last().click();await page.getByRole('button',{name:'Components panel',exact:true}).click();
 await expect(page.getByRole('group',{name:'Selected component instance'})).toContainText('Card');
 await page.getByRole('button',{name:'Default',exact:true}).click();await expect(f.locator('article[data-somnia-variant]')).toHaveCount(1);
 await page.keyboard.press('Control+z');await expect(f.locator('article[data-somnia-variant]')).toHaveCount(1);await page.keyboard.press('Control+z');await expect(f.locator('article[data-somnia-variant]')).toHaveCount(0);
 await page.getByRole('button',{name:'Make Wide the default of Card'}).click();await expect(page.getByRole('group',{name:'Component Card'})).toContainText('Wide (default)');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Remove variant Wide from Card'}).click();await expect(page.getByRole('group',{name:'Component Card'})).not.toContainText('Wide');
});

test('starter kit: add once, insert a variant, ids stay clean',async({page})=>{
 await page.goto('/');const f=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(f.locator('h1')).toBeVisible();
 await page.getByRole('button',{name:'section',exact:true}).click();await page.getByRole('button',{name:'Components panel',exact:true}).click();
 await page.getByRole('button',{name:'Add starter kit',exact:true}).click();
 await expect(page.getByRole('group',{name:'Component Starter Hero'})).toContainText('Centered');
 await page.getByRole('button',{name:'Add starter kit',exact:true}).click();
 await expect(page.getByRole('group',{name:'Component Starter Form'})).toHaveCount(1);
 await page.getByRole('button',{name:'Insert Starter Form Contact',exact:true}).click();await expect(f.locator('form[data-somnia-variant]')).toHaveCount(1);
 await page.getByRole('button',{name:'Insert Starter Form Contact',exact:true}).click();await expect(f.locator('form[data-somnia-variant]')).toHaveCount(2);
});
