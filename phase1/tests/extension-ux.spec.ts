import {test,expect} from './fixtures';
const mk=(id:string,name:string,description:string,permissions:string[]=[])=>({id,name,version:'1.0.0',author:'Acme',description,repo:'https://github.com/acme/x',download:'https://raw.githubusercontent.com/acme/x/v1/p.zip',sha256:'0'.repeat(64),apiVersion:1,permissions});
test('browser shows risk badges, result count, search ranking and sorting',async({page})=>{
 const list=[mk('a.zeta','Zeta Tools','helper for quiet work',['project.write']),mk('a.quiet','Quiet Colors','theme'),mk('a.mid','Mid','x',['commands'])];
 await page.route('https://raw.githubusercontent.com/**',route=>route.fulfill({json:{schemaVersion:1,extensions:list}}));
 await page.goto('/');await page.keyboard.press('Control+,');await page.getByRole('button',{name:'Extensions',exact:true}).click();
 await page.getByRole('button',{name:'Browse GitHub extensions'}).click();
 const items=page.getByLabel('Available extensions').locator('li');
 await expect(items).toHaveCount(3);await expect(page.getByText('3 of 3 extensions')).toBeVisible();
 await expect(page.getByTestId('risk-badge').first()).toBeVisible();
 await page.getByLabel('Search extensions').fill('quiet');
 await expect(items).toHaveCount(2);await expect(items.first()).toContainText('Quiet Colors');
 await page.getByLabel('Search extensions').fill('');
 await page.getByLabel('Sort extensions').selectOption('safest');
 await expect(items.first()).toContainText('Quiet Colors');await expect(items.last()).toContainText('Zeta Tools');
});
