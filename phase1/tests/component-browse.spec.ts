import {test,expect} from './fixtures';
test('browse components: search, tag, folder, preview and drag-insert with undo',async({page})=>{
 await page.goto('/');const f=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(f.locator('h1')).toBeVisible();
 await page.getByRole('button',{name:'section',exact:true}).click();await page.getByRole('button',{name:'Components panel',exact:true}).click();
 await page.getByRole('button',{name:'Card',exact:true}).click();await expect(f.locator('article')).toHaveCount(1);
 await page.getByRole('button',{name:'Layers panel',exact:true}).click();await page.getByRole('button',{name:'article',exact:true}).first().click();await page.getByRole('button',{name:'Components panel',exact:true}).click();
 await page.getByLabel('Component or variant name').fill('Pricing card');await page.getByRole('button',{name:'Save selection as new component',exact:true}).click();
 await expect(page.getByRole('group',{name:'Card Pricing card'})).toBeVisible();
 await expect(page.locator('iframe[title="Preview of Pricing card"]')).toHaveAttribute('sandbox','');
 await page.getByRole('button',{name:'Organize Pricing card'}).click();
 await page.getByLabel('Folder for Pricing card').fill('Marketing');await page.getByLabel('New tag for Pricing card').fill('Sales');await page.getByLabel('New tag for Pricing card').press('Enter');
 await page.getByRole('button',{name:'Organize Pricing card'}).click();
 await page.getByLabel('Search components').fill('nomatch');await expect(page.getByTestId('browse-count')).toContainText('0 of 1');
 await page.getByLabel('Search components').fill('sales');await expect(page.getByRole('group',{name:'Card Pricing card'})).toBeVisible();
 await page.getByLabel('Search components').fill('');await page.getByRole('button',{name:'#sales (1)'}).click();await expect(page.getByRole('group',{name:'Card Pricing card'})).toBeVisible();
 await page.getByRole('button',{name:'Marketing (1)'}).click();await expect(page.getByRole('group',{name:'Card Pricing card'})).toBeVisible();
 await page.reload();await page.getByRole('button',{name:'Components panel',exact:true}).click();await expect(page.getByRole('group',{name:'Card Pricing card'})).toContainText('#sales');
 // drag into canvas
 const before=await f.locator('article').count();
 const dt=await page.evaluateHandle(()=>new DataTransfer());
 await page.getByRole('group',{name:'Card Pricing card'}).dispatchEvent('dragstart',{dataTransfer:dt});
 const payload=await dt.evaluate(d=>d.getData('application/x-somnia-component'));expect(payload).toMatch(/.+:.+/);
 await page.locator('iframe[title="Sandboxed design preview"]').contentFrame().locator('main').evaluate((el,pl)=>{const d=new DataTransfer();d.setData('application/x-somnia-component',pl);el.dispatchEvent(new DragEvent('drop',{dataTransfer:d,bubbles:true,cancelable:true}));},payload);
 await expect(f.locator('article')).toHaveCount(before+1);
 await page.keyboard.press('Control+z');await expect(f.locator('article')).toHaveCount(before);
});
