import {test,expect} from './fixtures';

test('the active studio stays white on hover, in light and dark shells',async({page})=>{
 await page.goto('/');
 const pill=page.getByRole('radiogroup',{name:'Studios',exact:true});
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  const code=pill.getByRole('radio',{name:'Somnia Code',exact:true});
  await expect(code).toHaveCSS('background-color','rgb(255, 255, 255)');
  await expect(code).toHaveCSS('color','rgb(24, 24, 27)');
  await code.hover();
  await expect(code).toHaveCSS('background-color','rgb(255, 255, 255)');
  const docs=pill.getByRole('radio',{name:'Somnia Documents',exact:true});
  await docs.click();
  await expect(docs).toHaveAttribute('aria-checked','true');
  await expect(docs).toHaveCSS('background-color','rgb(255, 255, 255)');
  await expect(code).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await code.click();
 }
});

test('every registered studio shows a compact name on hover without changing selection',async({page})=>{
 await page.goto('/');
 const pill=page.getByRole('radiogroup',{name:'Studios',exact:true});
 for(const [name,short] of [['Somnia Code','Code'],['Somnia Documents','Docs'],['Somnia Sheets','Sheets'],['Slides','Slides'],['Somnia Sound','Sounds'],['Somnia Video','Video']]){
  const button=pill.getByRole('radio',{name,exact:true});
  await button.hover();
  await expect(page.getByRole('tooltip')).toHaveText(short);
  await expect(button).toHaveAccessibleDescription(short);
  await expect(button).toHaveAttribute('title','');
  await expect(pill.locator('[aria-checked="true"]')).toHaveAccessibleName('Somnia Code');
 }
 await page.mouse.move(0,100);
 await expect(page.getByRole('tooltip')).toHaveCount(0);
});

test('keyboard focus exposes short names and keeps roving studio selection',async({page})=>{
 await page.goto('/');
 const pill=page.getByRole('radiogroup',{name:'Studios',exact:true});
 await pill.getByRole('radio',{name:'Somnia Code',exact:true}).focus();
 await page.keyboard.press('ArrowRight');
 const docs=pill.getByRole('radio',{name:'Somnia Documents',exact:true});
 await expect(docs).toBeFocused();
 await expect(docs).toHaveAttribute('aria-checked','true');
 await expect(docs).toHaveAttribute('tabindex','0');
 await expect(page.getByRole('tooltip')).toHaveText('Docs');
 await page.keyboard.press('Escape');
 await expect(page.getByRole('tooltip')).toHaveCount(0);
 await expect(docs).toBeFocused();
 await page.keyboard.press('End');
 await expect(pill.getByRole('radio',{name:'Somnia Video',exact:true})).toBeFocused();
 await page.keyboard.press('Home');
 await expect(pill.getByRole('radio',{name:'Somnia Code',exact:true})).toBeFocused();
});
