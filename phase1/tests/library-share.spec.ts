import {test,expect} from './fixtures';
import {openMine} from './helpers';
const lib=(components:unknown[])=>JSON.stringify({format:'somnia-component-library',version:1,exportedAt:'2026-10-05T00:00:00Z',components});
const seed=[{id:'c1',name:'Card',defaultVariantId:'v1',variants:[{id:'v1',name:'Default',html:'<article class="card">A</article>'}]}];
test('export downloads JSON, import resolves a name conflict and bad files change nothing',async({page})=>{
 await page.addInitScript(s=>{if(!localStorage.getItem('somnia.components.v2'))localStorage.setItem('somnia.components.v2',JSON.stringify(s));},seed);
 await page.goto('/');await openMine(page);
 const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Export library (JSON)'}).click();const d=await dl;expect(d.suggestedFilename()).toMatch(/^somnia-components-\d{4}-\d{2}-\d{2}\.json$/);
 const input=page.getByLabel('Component library file');
 await input.setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"nope":1}')});
 await expect(page.getByText('This is not a Somnia component library file.')).toBeVisible();await expect(page.getByRole('group',{name:/^Component /})).toHaveCount(1);
 const incoming=lib([{id:'x1',name:'card',defaultVariantId:'q',variants:[{id:'q',name:'Wide',html:'<article class="card wide">A</article>'}]},{id:'x2',name:'Nav',defaultVariantId:'n',variants:[{id:'n',name:'Default',html:'<nav>N</nav>'}]}]);
 await input.setInputFiles({name:'shared.json',mimeType:'application/json',buffer:Buffer.from(incoming)});
 await expect(page.getByRole('group',{name:'Resolve import conflicts'})).toContainText('1 name conflict');
 await page.getByLabel('Resolution for card').selectOption('merge-variants');await page.getByRole('button',{name:'Apply import'}).click();
 await expect(page.getByRole('group',{name:'Component Card'})).toContainText('Wide');await expect(page.getByRole('group',{name:'Component Nav'})).toBeVisible();
 await expect(page.getByText(/Import done: 1 added, 1 merged/)).toBeVisible();
});
test('cancelling the conflict review changes nothing; library file round-trips through the project',async({page})=>{
 await page.addInitScript(s=>{if(!localStorage.getItem('somnia.components.v2'))localStorage.setItem('somnia.components.v2',JSON.stringify(s));},seed);
 await page.goto('/');await openMine(page);
 await expect(page.getByRole('button',{name:'Load library from project'})).toBeDisabled();
 await page.getByRole('button',{name:'Save library to project'}).click();await expect(page.getByText(/Library saved to somnia-components.json/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Load library from project'})).toBeEnabled();await page.getByRole('button',{name:'Save library to project'}).click();
 await page.getByRole('button',{name:'Load library from project'}).click();await expect(page.getByText(/Import done: 1 skipped/)).toBeVisible();
 await page.getByLabel('Component library file').setInputFiles({name:'s.json',mimeType:'application/json',buffer:Buffer.from(lib([{id:'z',name:'Card',defaultVariantId:'q',variants:[{id:'q',name:'Other',html:'<i></i>'}]}]))});
 await page.getByRole('button',{name:'Cancel'}).click();await expect(page.getByRole('group',{name:'Component Card'})).not.toContainText('Other');
});
