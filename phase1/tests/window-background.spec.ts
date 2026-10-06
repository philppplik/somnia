import {test,expect} from './fixtures';
test('background persists; browser uses solid fallback; undo and reset work',async({page})=>{
 await page.goto('/');await page.keyboard.press('Control+,');
 const background=page.getByLabel('App background',{exact:true});
 await expect(background).toHaveValue('solid');await background.selectOption('glass');
 await expect(page.locator('html')).toHaveAttribute('data-background','solid');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('somnia.look.v1')!).background)).toBe('glass');
 await page.reload();await page.keyboard.press('Control+,');await expect(background).toHaveValue('glass');
 await background.selectOption('solid');await background.focus();await page.keyboard.press('Control+z');await expect(background).toHaveValue('glass');
 await page.getByRole('button',{name:'Reset look',exact:true}).click();await expect(background).toHaveValue('solid');
});
test('visual CSS previews in light and dark; simulated desktop, not native compositor',async({page})=>{
 await page.goto('/');await page.keyboard.press('Control+,');
 await page.addStyleTag({content:`html{background:linear-gradient(120deg,#3c5fb2,#c45498 50%,#eeba78)!important}body,#root{background:transparent!important}#root .app-frame{height:calc(100dvh - 48px);margin:24px;min-height:600px}`});
 for(const theme of ['light','dark']){
  await page.getByLabel('App theme',{exact:true}).selectOption(theme);
  for(const mode of ['solid','glass']){
   await page.getByLabel('App background',{exact:true}).selectOption(mode);
   // No native desktop in this runner. Inspect the production CSS with the
   // native-success gate simulated; keep this explicit in filenames and docs.
   await page.evaluate(m=>{document.documentElement.dataset.background=m;document.documentElement.dataset.shell='desktop';},mode);
   await page.screenshot({path:`tests/artifacts/background-${mode}-${theme}-css-preview.png`});
   await page.keyboard.press('Escape');
   await page.screenshot({path:`tests/artifacts/background-${mode}-${theme}-shell-css-preview.png`});
   await page.keyboard.press('Control+,');
  }
 }
});
