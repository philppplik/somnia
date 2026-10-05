import {test,expect} from './fixtures';
test.use({sample:false});
for(const [tag,open] of [['es','Abrir carpeta'],['fr','Ouvrir un dossier'],['pt-BR','Abrir pasta']] as const){
 test(`${tag}: catalogue is selected and the start screen is translated`,async({page})=>{
  await page.goto('/');await page.evaluate(t=>localStorage.setItem('somnia.locale.v1',t),tag);await page.reload();await expect(page.locator('html')).toHaveAttribute('lang',tag);
  await expect(page.getByTestId('empty-state').getByRole('button',{name:open})).toBeVisible();
 });
}
