import {test,expect} from './fixtures';

for(const theme of ['light','dark']){
 test(`${theme}: workspace cards share the Agent radius and clip its bottom gradient`,async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Open Somnia Agent'}).click();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByLabel('App theme').selectOption(theme);
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  const cards=page.locator('.pane-slot>.panel,.center,.communication-panel');
  await expect(cards).toHaveCount(4);
  for(const card of await cards.all()){
   for(const corner of ['top-left','top-right','bottom-left','bottom-right']){
    await expect(card).toHaveCSS(`border-${corner}-radius`,'25px');
   }
   await expect(card).toHaveCSS('overflow','hidden');
  }
  const gradient=page.locator('.ag-bar');
  await expect(gradient).toHaveCSS('border-radius','0px 0px 25px 25px');
  await expect(gradient).toHaveCSS('clip-path','inset(0px round 0px 0px 25px 25px)');
  // One token drives every workspace card and the composited gradient clip.
  await page.evaluate(()=>document.documentElement.style.setProperty('--r-outer','30px'));
  for(const card of await cards.all())await expect(card).toHaveCSS('border-radius','30px');
  await expect(gradient).toHaveCSS('clip-path','inset(0px round 0px 0px 30px 30px)');
  // App frame shares the outer token; dialog/control tokens stay separate.
  await expect(page.locator('.app-frame')).toHaveCSS('border-radius','30px');
 });
}
