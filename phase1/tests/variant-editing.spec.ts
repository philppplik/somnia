import {test,expect} from './fixtures';
import {openMine} from './helpers';
const lib=[{id:'c1',name:'Card',defaultVariantId:'v1',variants:[
 {id:'v1',name:'Plain',html:'<article class="card">\n<h2>Title</h2>\n</article>'},
 {id:'v2',name:'Wide',html:'<article class="card wide">\n<h2>Title</h2>\n<p>More</p>\n</article>'}]}];
test('variants: edit in place, rename, duplicate, compare',async({page})=>{
 await page.addInitScript(l=>{if(!localStorage.getItem('somnia.components.v2'))localStorage.setItem('somnia.components.v2',JSON.stringify(l));},lib);
 await page.goto('/');const f=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(f.locator('h1')).toBeVisible();
 await openMine(page);
 const card=page.getByRole('group',{name:'Component Card',exact:true});
 // compare
 await page.getByRole('button',{name:'Compare Card Wide',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'added'})).toContainText('2 lines added');
 await page.getByRole('button',{name:'Close comparison of Card Wide',exact:true}).click();
 // edit with validation
 await page.getByRole('button',{name:'Edit Card Plain',exact:true}).click();
 const ta=page.getByLabel('HTML of Card Plain');
 await ta.fill('plain text');await expect(page.getByRole('alert')).toContainText('start with an HTML tag');
 await expect(page.getByRole('button',{name:'Save Card Plain',exact:true})).toBeDisabled();
 await ta.fill('<article class="card soft"><h2>Title</h2></article>');
 await page.getByRole('button',{name:'Save Card Plain',exact:true}).click();
 await expect(page.getByLabel('HTML of Card Plain')).toHaveCount(0);
 await page.reload();await openMine(page);
 await page.getByRole('button',{name:'Edit Card Plain',exact:true}).click();
 await expect(page.getByLabel('HTML of Card Plain')).toHaveValue(/card soft/);
 await page.getByRole('button',{name:'Cancel editing Card Plain',exact:true}).click();
 // rename + duplicate
 await page.getByRole('button',{name:'Rename variant Card Plain',exact:true}).click();
 await page.getByLabel('New name for Card Plain').fill('Soft');
 await page.getByRole('button',{name:'Save name for Card Plain',exact:true}).click();
 await expect(card).toContainText('Soft (default)');
 await page.getByRole('button',{name:'Duplicate Card Soft',exact:true}).click();
 await expect(card).toContainText('Soft copy');
});
